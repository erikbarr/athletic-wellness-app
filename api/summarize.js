export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { transcript, apiKey } = req.body;
    
    if (!transcript || !apiKey) {
      return res.status(400).json({ error: 'Missing transcript or API key' });
    }
    
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const summary = data.content[0].text.trim();
    
    res.status(200).json({ summary });
    
  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate summary' 
    });
  }
}
