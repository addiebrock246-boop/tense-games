// api/ask-ai.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, payload } = req.body;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Groq API key not configured' });

  let systemPrompt = '';
  let userPrompt = '';

  if (action === 'validate_translation') {
    systemPrompt = `You are an English teacher. Check if the user's English translation matches the Hindi sentence. 
Return ONLY a valid JSON (no extra text). JSON format:
{
  "status": "CORRECT" or "INCORRECT",
  "message": "short feedback",
  "correct_translation": "if INCORRECT, else empty string",
  "alternatives": ["array of other correct translations (if any)"],
  "explanation": "brief grammar note"
}`;
    userPrompt = `Hindi: "${payload.hindi}"\nUser's English: "${payload.userEnglish}"\nTense: ${payload.tense}`;
  }
  else if (action === 'validate_passive') {
    systemPrompt = `You are an English teacher. Check if the user's passive voice sentence is correct for the given active sentence.
Return ONLY a valid JSON. Format:
{
  "status": "CORRECT" or "INCORRECT",
  "message": "...",
  "correct_passive": "if INCORRECT, else empty string",
  "alternatives": ["array of other correct passive forms"]
}`;
    userPrompt = `Active: "${payload.active}"\nUser's Passive: "${payload.userPassive}"`;
  }
  else if (action === 'generate_question') {
    const used = payload.usedHindiSentences || [];
    const usedList = used.map(s => `"${s}"`).join(', ');
    systemPrompt = `You are a Hindi-English language exercise generator. Create a new Hindi sentence for English translation practice.
Tense: ${payload.tense} (if 'all', choose any tense: present, past, or future).
The sentence must NOT be any of these already used: [${usedList}].
Return ONLY a valid JSON: { "hindi": "new Hindi sentence" }`;
    userPrompt = "Generate.";
  }
  else if (action === 'generate_passive_question') {
    const usedActives = payload.usedActives || [];
    const usedList = usedActives.map(s => `"${s}"`).join(', ');
    systemPrompt = `You are an English exercise generator. Create a new active voice sentence (simple, moderate difficulty) for passive voice practice.
The sentence must NOT be any of these already used: [${usedList}].
Return ONLY a valid JSON: { "active": "new active sentence" }`;
    userPrompt = "Generate.";
  }
  else {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',  // या 'mixtral-8x7b-32768' (दोनों फ्री)
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' } // Groq में JSON mode सपोर्ट है (ज़रूरी नहीं, लेकिन अच्छा)
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Groq API error');
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // कई बार AI ```json ... ``` में लपेट देता है
    let jsonString = content;
    if (content.startsWith('```json')) {
      jsonString = content.slice(7, -3).trim();
    } else if (content.startsWith('```')) {
      jsonString = content.slice(3, -3).trim();
    }

    const result = JSON.parse(jsonString);
    return res.status(200).json(result);

  } catch (err) {
    console.error('Groq error:', err);
    return res.status(500).json({ error: 'AI failed', details: err.message });
  }
}
