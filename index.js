const { 
    Client, GatewayIntentBits, Partials, ActivityType, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const http = require('http');
const { DISCORD_TOKEN, PORT } = require('./config');
const { generateSetupAdvice } = require('./services/gemini');
const { getSession, updateSessionHistory, clearSession, logUserFeedback } = require('./services/session');
const { searchTracks, searchCars } = require('./services/autocomplete');

// 🔧 Hardcoded Production Admin Log Channel ID
const ADMIN_LOG_CHANNEL_ID = '1522549619538526258';

// 🔒 Hardcoded Premium Loyalty Role ID
const LOYALTY_ROLE_ID = '1517792455783874650';

// Simple web server for Render health checks
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Race Genie running!\n');
}).listen(PORT, () => {
    console.log(`Health check server listening on port ${PORT}`);
});

/**
 * Splits a text into chunks of at most maxLength characters, split cleanly at newlines.
 */
function splitMessage(text, maxLength = 2000) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    let currentChunk = '';
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.length > maxLength) {
            let remainingLine = line;
            while (remainingLine.length > 0) {
                const sliceLength = maxLength - currentChunk.length;
                currentChunk += remainingLine.slice(0, sliceLength);
                chunks.push(currentChunk);
                currentChunk = '';
                remainingLine = remainingLine.slice(sliceLength);
            }
        } else if ((currentChunk + line + '\n').length > maxLength) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

/**
 * Helper function to send formatted logs to the designated private admin channel
 */
async function logToAdminChannel(logMessage) {
    try {
        const channel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
        if (channel && channel.isTextBased()) {
            await channel.send({ content: logMessage });
        }
    } catch (err) {
        console.error("Failed to send log to admin channel:", err);
    }
}

// Initialize Discord Client with accurate Gateway Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('GT7 Telemetry', { type: ActivityType.Watching });
});

// --- HANDLE INTERACTIONS (SLASH COMMANDS, AUTOCOMPLETE, BUTTONS, MODALS) ---
client.on('interactionCreate', async (interaction) => {
    
    // 1. Handle Autocomplete fields
    if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === 'car-setup') {
            const focusedOption = interaction.options.getFocused(true);
            let choices = [];
            if (focusedOption.name === 'car') {
                choices = searchCars(focusedOption.value);
            } else if (focusedOption.name === 'track') {
                choices = searchTracks(focusedOption.value);
            }
            try {
                await interaction.respond(choices.map(choice => ({ name: choice, value: choice })));
            } catch (err) {
                console.error("Autocomplete Response Error:", err);
            }
        }
        return;
    }

    // 2. Handle Feedback Button clicks inside DMs
    if (interaction.isButton()) {
        const [action, ratingValue] = interaction.customId.split('_');
        if (action === 'rate') {
            // Build the modal window overlay for text notes
            const modal = new ModalBuilder()
                .setCustomId(`feedbackModal_${ratingValue}`)
                .setTitle('Race Engineering Review');

            const feedbackInput = new TextInputBuilder()
                .setCustomId('feedbackNotes')
                .setLabel("How did the setup handle? (Optional)")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("E.g., Snapped on curbs, great traction out of turn 4, etc.")
                .setRequired(false)
                .setMaxLength(500);

            const firstActionRow = new ActionRowBuilder().addComponents(feedbackInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        }
        return;
    }

    // 3. Handle Text Modal Submissions
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('feedbackModal_')) {
            const ratingType = interaction.customId.split('_')[1]; // 'up' or 'down'
            const userNotes = interaction.fields.getTextInputValue('feedbackNotes') || 'No comment added.';
            const session = getSession(interaction.user.id);
            const currentCar = session.activeCar || 'Unknown Car';

            // Save feedback directly to local training ledger if method exists
            if (typeof logUserFeedback === 'function') {
                logUserFeedback(interaction.user.id, interaction.user.tag, currentCar, ratingType, userNotes);
            }

            // Send sanitized status alert to admin logging dashboard
            const emoji = ratingType === 'up' ? '👍' : '👎';
            await logToAdminChannel(`📊 **Tuning Feedback Submitted**\n👤 **Driver:** ${interaction.user.tag}\n🏎️ **Car:** ${currentCar}\n🎯 **Rating:** ${emoji}\n📋 *Review notes: "${userNotes}"*`);

            await interaction.reply({
                content: "🏁 **Feedback Received:** Thank you! Your notes have been securely compiled into the garage telemetry pool to help refine future tune paths.",
                ephemeral: true
            });
            
            // Disable original buttons on the message so they can't double-submit
            try {
                await interaction.message.edit({ components: [] });
            } catch (e) {
                console.error("Failed to clear buttons:", e);
            }
        }
        return;
    }

    // 4. Handle Slash Commands Execution
    if (!interaction.isChatInputCommand()) return;
    const { commandName, user, member } = interaction;

    // 🔒 ROLE SECURITY CHECK: Verify user has the required loyalty benefit role
    if (commandName === 'car-setup' || commandName === 'reset') {
        if (!member || !member.roles.cache.has(LOYALTY_ROLE_ID)) {
            await logToAdminChannel(`🛡️ **Access Denied (Missing Role)**\n👤 **User:** ${user.tag} (${user.id})\n⚠️ Attempted to use \`/${commandName}\` without the loyalty benefit role.`);
            return interaction.reply({
                content: "🔒 **Access Restricted:** Race Genie is a premium loyalty benefit reserved for specific server members. If you think this is a mistake, please reach out to an admin!",
                ephemeral: true
            });
        }
    }

    if (commandName === 'car-setup') {
        const car = interaction.options.getString('car');
        const track = interaction.options.getString('track');
        const tyres = interaction.options.getString('tyres'); 
        const weather = interaction.options.getString('weather') || 'Standard Dry';
        const drivetrain = interaction.options.getString('drivetrain');
        const frontDownforce = interaction.options.getString('front_downforce');
        const rearDownforce = interaction.options.getString('rear_downforce');
        const regulations = interaction.options.getString('regulations');
        const screenshot = interaction.options.getAttachment('screenshot');

        await interaction.deferReply({ ephemeral: true });
        
        // Cache the car explicitly in the user's local session cache for tracking feedback later
        const session = getSession(user.id);
        session.activeCar = car; 

        let userPrompt = `Request details:\n- Car: ${car}\n- Track: ${track}\n- Tyres: ${tyres}\n- Weather/Conditions: ${weather}`;
        if (drivetrain) userPrompt += `\n- Drivetrain Layout: ${drivetrain}`;
        if (frontDownforce) userPrompt += `\n- Front Downforce: ${frontDownforce}`;
        if (rearDownforce) userPrompt += `\n- Rear Downforce: ${rearDownforce}`;
        if (regulations) userPrompt += `\n- Regulations: ${regulations}`;
        if (screenshot) userPrompt += `\n- Screenshot attached.`;

        // Telemetry Logging: Only revealing User and Car parameters for monitoring
        await logToAdminChannel(`⚙️ **New Engineering Session Started**\n👤 **Driver:** ${user.tag} (${user.id})\n🏎️ **Car:** ${car}\n📋 *Baseline request submitted successfully.*`);

        try {
            const advice = await generateSetupAdvice(userPrompt, session.history, screenshot);
            updateSessionHistory(user.id, userPrompt, advice);

            const responseText = `🏁 **YOUR PRIVATE SETUP SHEET:**\n\n${advice}`;
            const chunks = splitMessage(responseText);

            // Send advice text block loops safely
            for (let i = 0; i < chunks.length; i++) {
                // If it's the very last text block segment, attach the custom rating UI rows
                if (i === chunks.length - 1) {
                    const feedbackRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('rate_up')
                                .setLabel('Good Setup 👍')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('rate_down')
                                .setLabel('Needs Adjustments 👎')
                                .setStyle(ButtonStyle.Danger)
                        );

                    await user.send({ content: chunks[i], components: [feedbackRow] });
                } else {
                    await user.send({ content: chunks[i] });
                }
            }

            await interaction.editReply({
                content: "🏁 *Analysis complete! Your custom setup sheet has been sent directly to your DMs.*"
            });

            // Telemetry Logging: Successful delivery
            await logToAdminChannel(`✅ **Setup Sheet Delivered**\n👤 **Driver:** ${user.tag}\n🏎️ **Car:** ${car}\n📋 *Baseline sheet generated and successfully DMed.*`);

        } catch (error) {
            console.error("Interaction Setup Error:", error);
            if (error.code === 50007) {
                await interaction.editReply({
                    content: "⚠️ *I tried to DM you your setup, but your privacy settings are blocking direct messages. Please enable DMs and try again!*"
                });
                await logToAdminChannel(`❌ **Delivery Failed (DMs Blocked)**\n👤 **Driver:** ${user.tag}\n⚠️ *User has direct messages disabled.*`);
            } else {
                await interaction.editReply({
                    content: "⚠️ *Engineering telemetry link dropped. Please try again in a moment.*"
                });
                await logToAdminChannel(`💥 **Engine Error**\n👤 **Driver:** ${user.tag}\n⚠️ *Internal error occurred during execution.*`);
            }
        }
    }

    if (commandName === 'reset') {
        const deleted = clearSession(user.id);
        const logMsg = deleted 
            ? `🧹 **Manual Reset:** ${user.tag} cleared their active session cache.` 
            : `🧹 **Manual Reset:** ${user.tag} attempted a reset but had no active cache.`;
        await logToAdminChannel(logMsg);

        if (deleted) {
            await interaction.reply({ content: "🏁 *Race memory cleared. Setup cache is back to baseline.*", ephemeral: true });
        } else {
            await interaction.reply({ content: "🏁 *You don't have any active setup session memory to clear.*", ephemeral: true });
        }
    }
});

// --- HANDLE NATURAL DM CHAT ---
client.on('messageCreate', async (message) => {
    if (message.channel.type !== 1 || message.author.bot) return;

    const user = message.author;
    const session = getSession(user.id);

    // DM context relies on a valid server-side session
    if (!session.history || session.history.length === 0) {
        return message.channel.send({
            content: "🏁 *Your active engineering session has expired or has not been initialized yet. Please return to the server channel and use the `/car-setup` command to start a new tuning profile!*"
        });
    }
    
    await message.channel.sendTyping();
    const userPrompt = message.content;

    // Telemetry Logging: DM follow-up intercept (Sanitized: Content removed)
    await logToAdminChannel(`💬 **DM Follow-up Received**\n👤 **Driver:** ${user.tag}\n📝 *Processing tuning adjustments...*`);

    try {
        const reply = await generateSetupAdvice(userPrompt, session.history, null);
        updateSessionHistory(user.id, userPrompt, reply);

        const chunks = splitMessage(reply);
        for (let i = 0; i < chunks.length; i++) {
            // Attach the feedback layout matrix to the final text block response loop inside follow up chats too
            if (i === chunks.length - 1) {
                const feedbackRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('rate_up')
                            .setLabel('Good Setup 👍')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('rate_down')
                            .setLabel('Needs Adjustments 👎')
                            .setStyle(ButtonStyle.Danger)
                    );

                await message.channel.send({ content: chunks[i], components: [feedbackRow] });
            } else {
                await message.channel.send({ content: chunks[i] });
            }
        }
    } catch (error) {
        console.error("DM Chat Error:", error);
        await message.channel.send({
            content: "⚠️ *Engineering link dropped. Let's try that adjustment again in a moment.*"
        });
        await logToAdminChannel(`💥 **DM Adjustment Error:** Failed to process follow-up response for ${user.tag}.`);
    }
});

client.login(DISCORD_TOKEN);
