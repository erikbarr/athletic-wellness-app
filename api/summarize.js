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
    
    // UPDATED PROMPT - Cleaner, no extra labels or notes
    const prompt = `Please revise this voice transcript to improve clarity and readability, while keeping the same meaning and information.

Original: "${transcript}"

Instructions:
- Fix any unclear or incomplete sentences
- Write at an 8th grade reading level
- Keep the same terminology and information that was spoken
- Make it flow better and be easier to read
- Don't add new medical terms or change the style
- Just clean up the language to make it clearer
- Return only the revised text, nothing else

Revised version:`;

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
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          let summary = data.content[0].text.trim();
          
          // Clean up the response - remove unwanted prefixes and suffixes
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

// Clean up AI response to remove unwanted text
function cleanupSummary(text) {
  let cleaned = text;
  
  // Remove common prefixes that might appear
  const prefixesToRemove = [
    'REVISED NOTE:',
    'Revised Note:',
    'revised note:',
    'REVISED:',
    'Revised:',
    'revised:',
    'NOTE:',
    'Note:',
    'note:',
    'SUMMARY:',
    'Summary:',
    'summary:'
  ];
  
  prefixesToRemove.forEach(prefix => {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.substring(prefix.length).trim();
    }
  });
  
  // Remove common suffixes or notes that might be added
  const suffixesToRemove = [
    'Note:',
    'NOTE:',
    'Additional notes:',
    'Additional Notes:',
    'ADDITIONAL NOTES:'
  ];
  
  suffixesToRemove.forEach(suffix => {
    const index = cleaned.lastIndexOf(suffix);
    if (index > -1 && index > cleaned.length * 0.7) { // Only remove if it's near the end
      cleaned = cleaned.substring(0, index).trim();
    }
  });
  
  // Remove any trailing periods that might be doubled up
  cleaned = cleaned.replace(/\.+$/, '.');
  
  // Ensure it doesn't end with incomplete sentences due to cleanup
  if (cleaned.endsWith(',') || cleaned.endsWith(';')) {
    cleaned = cleaned.slice(0, -1) + '.';
  }
  
  return cleaned.trim();
}
