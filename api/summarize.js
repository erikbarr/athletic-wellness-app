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
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    console.log('Claude API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Claude API error:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { error: errorText };
      }
      
      return res.status(response.status).json({ 
        error: errorData.error?.message || errorData.error || `Claude API error: ${response.status}` 
      });
    }

    const data = await response.json();
    const summary = data.content[0].text.trim();
    
    console.log('Successfully generated summary');
    res.status(200).json({ summary });
    
  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate summary' 
    });
  }
}
