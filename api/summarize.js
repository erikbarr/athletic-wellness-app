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
    
    // UPDATED PROMPT - Physical therapy style with two sections
    const prompt = `Please convert this voice transcript into a professional physical therapy encounter note with two clear sections. Write in simple, clear language at a 6th grade reading level.

Original transcript: "${transcript}"

Instructions:
- Create exactly two sections as shown below
- Write in paragraph format (not bullet points)
- Use simple words and short sentences
- Sound professional like a physical therapy note
- Include specific details mentioned in the transcript
- If no treatment plan is discussed, write "No treatment plan discussed during this session."

Format your response exactly like this:

**EVALUATION SUMMARY:**
[Write a detailed paragraph describing what was found during the evaluation. Include any pain, movement problems, strength issues, or other findings that were noted. Mention specific body parts and describe what the patient reported or what was observed.]

**TREATMENT PLAN:**
[Write a detailed paragraph about any treatment ideas, exercises, recommendations, or next steps that were discussed. Include any advice given to the patient, planned treatments, or follow-up instructions. If no treatment was discussed, state that clearly.]`;

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
            max_tokens: 500, // Increased for more detailed content
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

// Clean up AI response to ensure proper formatting
function cleanupSummary(text) {
  let cleaned = text.trim();
  
  // Remove any unwanted prefixes that might appear before the structured content
  const unwantedPrefixes = [
    'Here is the formatted response:',
    'Here\'s the formatted response:',
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
  
  // Ensure the two main sections are properly formatted
  if (!cleaned.includes('**EVALUATION SUMMARY:**')) {
    // If the format is wrong, try to fix basic structure
    if (cleaned.toLowerCase().includes('evaluation') && cleaned.toLowerCase().includes('treatment')) {
      // Attempt basic formatting if sections exist but are not properly marked
      cleaned = cleaned.replace(/evaluation summary:?/gi, '**EVALUATION SUMMARY:**');
      cleaned = cleaned.replace(/treatment plan:?/gi, '\n\n**TREATMENT PLAN:**');
    }
  }
  
  // Clean up any double asterisks or formatting issues
  cleaned = cleaned.replace(/\*\*\*+/g, '**');
  
  // Ensure proper spacing between sections
  cleaned = cleaned.replace(/\*\*TREATMENT PLAN:\*\*/g, '\n\n**TREATMENT PLAN:**');
  
  // Remove any trailing periods that might be doubled up
  cleaned = cleaned.replace(/\.+$/g, '.');
  
  // Ensure sections end with proper punctuation
  const sections = cleaned.split('**TREATMENT PLAN:**');
  if (sections.length === 2) {
    let evalSection = sections[0].replace('**EVALUATION SUMMARY:**', '').trim();
    let treatmentSection = sections[1].trim();
    
    // Ensure each section ends with a period
    if (evalSection && !evalSection.endsWith('.') && !evalSection.endsWith('!') && !evalSection.endsWith('?')) {
      evalSection += '.';
    }
    if (treatmentSection && !treatmentSection.endsWith('.') && !treatmentSection.endsWith('!') && !treatmentSection.endsWith('?')) {
      treatmentSection += '.';
    }
    
    cleaned = '**EVALUATION SUMMARY:**\n' + evalSection + '\n\n**TREATMENT PLAN:**\n' + treatmentSection;
  }
  
  return cleaned.trim();
}
