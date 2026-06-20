// In-memory data store for user setup sessions
const sessions = new Map();

// 24 hours in milliseconds (24 * 60 * 60 * 1000)
const SESSION_TIMEOUT = 86400000;

/**
 * Retrieves a user's active session. If it has expired (>24 hours), it automatically clears it.
 */
function getSession(userId) {
    const currentTime = Date.now();
    const session = sessions.get(userId);

    if (session) {
        // Check if 24 hours have passed since their last engineering activity
        if (currentTime - session.lastAccessed > SESSION_TIMEOUT) {
            sessions.delete(userId);
            return { history: [], lastAccessed: currentTime };
        }
        
        // Update access time to keep it alive if they are actively chatting within the 24 hours
        session.lastAccessed = currentTime;
        return session;
    }

    // Initialize fresh structure if none exists
    const newSession = { history: [], lastAccessed: currentTime };
    sessions.set(userId, newSession);
    return newSession;
}

/**
 * Saves or appends details to the active conversation history matrix
 */
function updateSessionHistory(userId, userPrompt, botResponse) {
    const session = getSession(userId); // This will naturally handle or refresh active state
    
    session.history.push({ role: 'user', parts: [{ text: userPrompt }] });
    session.history.push({ role: 'model', parts: [{ text: botResponse }] });
    session.lastAccessed = Date.now();
    
    sessions.set(userId, session);
}

/**
 * Manually flushes the session baseline
 */
function clearSession(userId) {
    if (sessions.has(userId)) {
        sessions.delete(userId);
        return true;
    }
    return false;
}

module.exports = {
    getSession,
    updateSessionHistory,
    clearSession
};
