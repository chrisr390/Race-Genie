const { GoogleGenAI } = require('@google/genai');
const { GEMINI_API_KEY } = require('../config');

// Initialize the Google GenAI client using the correct SDK parameters
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * Generates custom setup sheets or parses follow-up adjustments using conversation history.
 */
async function generateSetupAdvice(userPrompt, history = [], screenshotAttachment = null) {
    try {
        // Enforced GT7 brake balance rules directly in the system instruction
        const systemInstruction = `You are Race Genie, an expert trackside race engineer for the FCSC sim racing community specializing in Gran Turismo 7 (GT7). 
Your job is to provide precise, actionable tuning advice (suspension, differential, aerodynamics, brake balance) based on the user's car, track, and handling complaints. 

⚠️ CRITICAL BREAK BALANCE SCALE CONFIGURATION:
- In Gran Turismo 7, the Brake Balance (Brake Bias) parameter ranges strictly from -5 to +5.
- Negative values (-1 down to -5) represent MAXIMUM FRONT BIAS. Suggest negative values if the car lacks stability under heavy breaking or oversteers when entering a corner on the brakes.
- Positive values (+1 up to +5) represent MAXIMUM REAR BIAS. Suggest positive values if the car is understeering heavily on corner entry or if the driver needs to induce rotation under trail braking.
- 0 represents a neutral 50:50 distribution.
- NEVER suggest a value outside the [-5, +5] integer spectrum. Never use percentages or fraction values for brake balance.

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
