export default async function handler(req, res) {
  // Enable CORS for all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    res.status(200).end();
    return;
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log(`Method ${req.method} not allowed`);
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  try {
    const { transcript, apiKey } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ error: 'Missing transcript' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Missing API key' });
    }
    
    if (!apiKey.startsWith('sk-ant-')) {
      return res.status(400).json({ error: 'Invalid API key format' });
    }
    
    // UPDATED PROMPT - Patient-friendly physical therapy progress note
    const prompt = `Please convert this voice transcript into a patient-friendly physical therapy progress note. Write at an 8th grade reading level using simple, clear language that patients and their families can easily understand.

Original transcript: "${transcript}"

Instructions:
- Write in a warm, encouraging tone as if speaking directly to the patient
- Use simple words and short sentences (8th grade reading level)
- Create exactly five sections as shown below
- Write in paragraph format, except evaluation results should be bulleted
- Include specific details mentioned in the transcript
- Make it detailed and comprehensive, not concise
- If information for a section isn't available, write "We didn't cover this area during today's session."

Format your response exactly like this:

**What We Discussed:**
[Write a detailed paragraph about the conversation during the session. Include what the patient told you about their pain, concerns, goals, daily activities, or any problems they're having. Mention how they're feeling and what's important to them about getting better.]

**What We Did Today:**
[Write a detailed paragraph describing all the activities, exercises, treatments, or assessments that happened during the session. Explain what each activity was meant to help with. If any measurements or tests were done, list them as bullets below this paragraph.]

• [Any specific test results, measurements, or evaluation findings]
• [Additional evaluation results if applicable]

**How You Responded:**
[Write a detailed paragraph about how the patient did during the session. Include their effort level, any improvements noticed, challenges they faced, pain levels during activities, and overall response to treatment. Be encouraging and specific about what went well.]

**What's Next:**
[Write a detailed paragraph about the plan moving forward. Include upcoming appointments, goals to work on, things to focus on, and what to expect in future sessions. Mention any timeline for improvement or next steps in their recovery.]

**Home Program Details:**
[Write a detailed paragraph with specific instructions for exercises or activities to do at home. Include how often to do them, any precautions to take, and what to watch for. If no home program was given, explain why and what the patient should focus on instead.]`;

    // Try different models in order of preference
    const models = [
      'claude-3-5-sonnet-20241022',  // Latest Sonnet
      'claude-3-sonnet-20240229',    // Original Sonnet
      'claude-3-haiku-20240307'      // Faster, more accessible model
    ];
    
    let lastError = null;
    
    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 1000, // Increased for more detailed content
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          let summary = data.content[0].text.trim();
          
          // Clean up the response and ensure proper formatting
          summary = cleanupSummary(summary);
          
          console.log(`Successfully generated summary using ${model}`);
          return res.status(200).json({ summary, modelUsed: model });
        }
        
        // If not ok, parse the error and try next model
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText };
        }
        
        lastError = errorData;
        
        // If it's not a model-specific error, don't try other models
        if (!errorText.includes('model') && !errorText.includes('Model')) {
          throw new Error(errorData.error?.message || errorData.error || `API error: ${response.status}`);
        }
        
        console.log(`Model ${model} not available, trying next...`);
        
      } catch (fetchError) {
        console.log(`Error with model ${model}:`, fetchError.message);
        lastError = { error: fetchError.message };
        
        if (!fetchError.message.includes('model') && !fetchError.message.includes('Model')) {
          throw fetchError;
        }
      }
    }
    
    // If we get here, all models failed
    throw new Error(lastError?.error?.message || lastError?.error || 'All Claude models failed');
    
  } catch (error) {
    console.error('Summarization error:', error);
    
    let errorMessage = error.message;
    
    if (errorMessage.includes('model')) {
      errorMessage = 'Your API key does not have access to Claude models. Please check your Anthropic account subscription and billing.';
    } else if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
      errorMessage = 'Invalid API key. Please check your Claude API key.';
    } else if (errorMessage.includes('429') || errorMessage.includes('rate')) {
      errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
    } else if (errorMessage.includes('insufficient_quota') || errorMessage.includes('billing')) {
      errorMessage = 'Insufficient credits or billing issue. Please check your Anthropic account.';
    }
    
    res.status(500).json({ 
      error: errorMessage
    });
  }
}

// Clean up AI response to ensure proper formatting for patient-friendly notes
function cleanupSummary(text) {
  let cleaned = text.trim();
  
  // Remove any unwanted prefixes that might appear before the structured content
  const unwantedPrefixes = [
    'Here is the formatted response:',
    'Here\'s the formatted response:',
    'Here is the patient-friendly note:',
    'Here\'s the patient-friendly note:',
    'Response:',
    'RESPONSE:',
    'Output:',
    'OUTPUT:'
  ];
  
  unwantedPrefixes.forEach(prefix => {
    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleaned = cleaned.substring(prefix.length).trim();
    }
  });
  
  // Define the required sections in order
  const requiredSections = [
    '**What We Discussed:**',
    '**What We Did Today:**',
    '**How You Responded:**',
    '**What\'s Next:**',
    '**Home Program Details:**'
  ];
  
  // Ensure all sections are properly formatted
  requiredSections.forEach(section => {
    const sectionName = section.replace(/\*\*/g, '').replace(':', '');
    const variations = [
      sectionName.toLowerCase() + ':',
      sectionName.toLowerCase(),
      sectionName + ':',
      sectionName
    ];
    
    variations.forEach(variation => {
      const regex = new RegExp(variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      cleaned = cleaned.replace(regex, section);
    });
  });
  
  // Clean up any multiple asterisks or formatting issues
  cleaned = cleaned.replace(/\*\*\*+/g, '**');
  
  // Ensure proper spacing between sections
  requiredSections.slice(1).forEach(section => {
    const regex = new RegExp('\\' + section, 'g');
    cleaned = cleaned.replace(regex, '\n\n' + section);
  });
  
  // Fix bullet point formatting
  cleaned = cleaned.replace(/^[\s]*[•·\-\*]\s*/gm, '• ');
  
  // Ensure sections end with proper punctuation
  const sections = cleaned.split(/(\*\*[^*]+:\*\*)/);
  let result = '';
  
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].includes('**') && sections[i].includes(':**')) {
      // This is a section header
      result += sections[i];
      if (i + 1 < sections.length) {
        result += '\n';
      }
    } else if (sections[i].trim()) {
      // This is section content
      let content = sections[i].trim();
      
      // Ensure proper punctuation for non-bullet content
      const lines = content.split('\n');
      const processedLines = lines.map(line => {
        line = line.trim();
        if (line && !line.startsWith('•') && !line.endsWith('.') && 
            !line.endsWith('!') && !line.endsWith('?') && !line.endsWith(':')) {
          line += '.';
        }
        return line;
      });
      
      content = processedLines.join('\n');
      result += content;
      
      if (i + 1 < sections.length) {
        result += '\n';
      }
    }
  }
  
  // Final cleanup
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  
  return result;
}
