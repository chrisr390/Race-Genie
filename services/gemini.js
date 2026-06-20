const { GoogleGenAI } = require('@google/genai');
const { GEMINI_API_KEY } = require('../config');

// Initialize the Google GenAI client using the correct SDK parameters
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * Generates custom setup sheets or parses follow-up adjustments using conversation history.
 */
async function generateSetupAdvice(userPrompt, history = [], screenshotAttachment = null) {
    try {
        const systemInstruction = `You are Race Genie, an expert trackside race engineer for the FCSC sim racing community specializing in Gran Turismo 7 (GT7). 
Your job is to provide precise, actionable tuning advice (suspension, differential, aerodynamics, brake balance) based on the user's car, track, and handling complaints. 
Be concise, encourage the driver, and keep your formatting clean with bold text and bullet points.`;

        // Safely format the session history to ensure compatibility with the @google/genai payload structure
        const formattedContents = history.map(turn => {
            return {
                role: turn.role === 'model' ? 'model' : 'user',
                parts: Array.isArray(turn.parts) 
                    ? turn.parts.map(p => typeof p === 'string' ? { text: p } : p)
                    : [{ text: String(turn.text || turn.parts) }]
            };
        });

        // Initialize the current user input part
        const currentMessageParts = [{ text: userPrompt }];

        // Handle attachment telemetry parsing if an image object is active
        if (screenshotAttachment && screenshotAttachment.url) {
            const response = await fetch(screenshotAttachment.url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            currentMessageParts.push({
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: screenshotAttachment.contentType
                }
            });
        }

        // Push the new message block into the formatted conversation stream
        formattedContents.push({
            role: 'user',
            parts: currentMessageParts
        });

        // Call the SDK model client handler
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: formattedContents,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7
            }
        });

        return response.text;

    } catch (error) {
        console.error("Gemini Generation Engine Error:", error);
        throw error;
    }
}

module.exports = {
    generateSetupAdvice
};
