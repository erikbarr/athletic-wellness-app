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
    console.log('Processing POST request...');
    
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
    
    console.log('Making request to Claude API...');
    
    const prompt = `You are a medical AI assistant helping to summarize voice notes from athletic wellness evaluations. 

Please analyze this voice transcript from a medical professional conducting a wellness assessment and create a concise, professional clinical summary:

TRANSCRIPT:
"${transcript}"

Please provide a structured summary that includes:
1. Key findings (pain, mobility issues, strength concerns)
2. Affected body regions/segments
3. Clinical observations
4. Any recommended focus areas

Keep the summary concise but clinically relevant for an athletic wellness assessment. Use professional medical terminology when appropriate.

SUMMARY:`;

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
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        console.log(`${model} response status:`, response.status);

        if (response.ok) {
          const data = await response.json();
          const summary = data.content[0].text.trim();
          
          console.log(`Successfully generated summary using ${model}`);
          return res.status(200).json({ summary, modelUsed: model });
        }
        
        // If not ok, parse the error
        const errorText = await response.text();
        console.log(`${model} error:`, errorText);
        
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
        
        // Continue to next model if this was a model-specific error
        console.log(`Model ${model} not available, trying next...`);
        
      } catch (fetchError) {
        console.log(`Error with model ${model}:`, fetchError.message);
        lastError = { error: fetchError.message };
        
        // If it's not a model error, don't try other models
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
    
    // Provide helpful error messages
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
