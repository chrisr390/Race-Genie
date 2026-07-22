const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/timetrial.json');

// Ensure data folder and file exist
function loadTTData() {
    try {
        const dir = path.dirname(DATA_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(DATA_PATH)) {
            fs.writeFileSync(DATA_PATH, JSON.stringify({ event: null, submissions: {} }, null, 2));
        }
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    } catch (err) {
        console.error('Error loading Time Trial data:', err);
        return { event: null, submissions: {} };
    }
}

function saveTTData(data) {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error saving Time Trial data:', err);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tt')
        .setDescription('Gran Turismo 7 Time Trial Manager')
        
        // --- SUBCOMMAND: START EVENT ---
        .addSubcommand(sub =>
            sub.setName('start')
                .setDescription('Start a new GT7 Time Trial event')
                .addStringOption(opt => opt.setName('track').setDescription('Track & Layout').setRequired(true))
                .addStringOption(opt => opt.setName('car').setDescription('Car or Car Class').setRequired(true))
                .addStringOption(opt => opt.setName('deadline').setDescription('End Date / Time (e.g., 30/07/2026 23:59)').setRequired(true))
        )
        
        // --- SUBCOMMAND: SUBMIT TIME ---
        .addSubcommand(sub =>
            sub.setName('submit')
                .setDescription('Submit your lap time with screenshot proof')
                .addStringOption(opt => opt.setName('time').setDescription('Lap Time (Format: M:SS.MMM e.g., 1:32.456)').setRequired(true))
                .addAttachmentOption(opt => opt.setName('screenshot').setDescription('Upload screenshot proof').setRequired(true))
                .addStringOption(opt => opt.setName('psn').setDescription('Your PSN ID').setRequired(false))
        )

        // --- SUBCOMMAND: LEADERBOARD ---
        .addSubcommand(sub =>
            sub.setName('leaderboard')
                .setDescription('Display current Time Trial standings')
        )

        // --- SUBCOMMAND: CLEAR LEADERBOARD ---
        .addSubcommand(sub =>
            sub.setName('clear')
                .setDescription('Wipe all submissions and reset the leaderboard for a new session')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const ttData = loadTTData();

        // ==========================================
        // 1. START NEW EVENT
        // ==========================================
        if (subcommand === 'start') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
                return interaction.reply({ content: '❌ You need Manage Events permissions to start a Time Trial.', ephemeral: true });
            }

            const track = interaction.options.getString('track');
            const car = interaction.options.getString('car');
            const deadline = interaction.options.getString('deadline');

            ttData.event = { track, car, deadline };
            ttData.submissions = {}; // Clear old submissions when starting new event
            saveTTData(ttData);

            const eventEmbed = new EmbedBuilder()
                .setTitle('⏱️ NEW GT7 TIME TRIAL IS LIVE!')
                .setDescription(`A new Sport Mode time trial has begun! Submit your fastest lap and screenshot using \`/tt submit\`.`)
                .addFields(
                    { name: '📍 Track', value: track, inline: true },
                    { name: '🏎️ Car / Class', value: car, inline: true },
                    { name: '⏳ Deadline', value: deadline, inline: true }
                )
                .setColor('#4CE600')
                .setFooter({ text: 'Future Champions Social Club • Time Trial Series' })
                .setTimestamp();

            return interaction.reply({ embeds: [eventEmbed] });
        }

        // ==========================================
        // 2. SUBMIT LAP TIME
        // ==========================================
        if (subcommand === 'submit') {
            if (!ttData.event) {
                return interaction.reply({ content: '❌ There is no active Time Trial event right now!', ephemeral: true });
            }

            const timeStr = interaction.options.getString('time').trim();
            const attachment = interaction.options.getAttachment('screenshot');
            const psn = interaction.options.getString('psn') || interaction.user.username;

            // Validate M:SS.MMM format
            const timeRegex = /^([0-9]{1,2}):([0-5][0-9])\.([0-9]{3})$/;
            const match = timeStr.match(timeRegex);

            if (!match) {
                return interaction.reply({
                    content: '❌ Invalid time format! Please use **`M:SS.MMM`** (e.g., `1:32.456` or `0:58.123`).',
                    ephemeral: true
                });
            }

            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const millis = parseInt(match[3], 10);
            const totalMs = (minutes * 60 * 1000) + (seconds * 1000) + millis;

            const userId = interaction.user.id;
            const existingEntry = ttData.submissions[userId];

            if (existingEntry && existingEntry.timeMs <= totalMs) {
                return interaction.reply({
                    content: `⚠️ Your previous recorded time of **\`${existingEntry.time}\`** is faster than or equal to this submission (**\`${timeStr}\`**). No change made.`,
                    ephemeral: true
                });
            }

            // Save new personal best
            ttData.submissions[userId] = {
                userId: userId,
                psn: psn,
                time: timeStr,
                timeMs: totalMs,
                proofUrl: attachment.url,
                timestamp: new Date().toISOString()
            };
            saveTTData(ttData);

            const isImprovement = existingEntry ? true : false;

            const confirmEmbed = new EmbedBuilder()
                .setTitle(isImprovement ? '🚀 TIME IMPROVED!' : '✅ LAP TIME LOGGED!')
                .setDescription(`**Driver:** ${interaction.user} (\`${psn}\`)\n**Best Lap:** \`${timeStr}\``)
                .setImage(attachment.url)
                .setColor('#4CE600')
                .setFooter({ text: 'Future Champions Social Club • Time Trial Series' })
                .setTimestamp();

            return interaction.reply({
                content: isImprovement 
                    ? `🔥 **Personal Best updated!** Previous: \`${existingEntry.time}\` ➔ New: \`${timeStr}\``
                    : `✅ Time submitted successfully!`,
                embeds: [confirmEmbed]
            });
        }

        // ==========================================
        // 3. GENERATE LEADERBOARD
        // ==========================================
        if (subcommand === 'leaderboard') {
            if (!ttData.event) {
                return interaction.reply({ content: '❌ No active Time Trial event found.', ephemeral: true });
            }

            const submissions = Object.values(ttData.submissions);

            if (submissions.length === 0) {
                return interaction.reply({ content: '📊 No times recorded yet. Be the first with `/tt submit`!', ephemeral: true });
            }

            // Sort fastest to slowest
            submissions.sort((a, b) => a.timeMs - b.timeMs);
            const leaderMs = submissions[0].timeMs;

            let boardText = '';
            submissions.forEach((entry, index) => {
                const pos = index === 0 ? '🥇 P1' : index === 1 ? '🥈 P2' : index === 2 ? '🥉 P3' : `**P${index + 1}**`;
                
                let gap = '';
                if (index > 0) {
                    const diffSec = ((entry.timeMs - leaderMs) / 1000).toFixed(3);
                    gap = ` *(+${diffSec}s)*`;
                }

                boardText += `${pos} — **\`${entry.time}\`** | <@${entry.userId}> (\`${entry.psn}\`)${gap}\n`;
            });

            const boardEmbed = new EmbedBuilder()
                .setTitle(`🏆 GT7 TIME TRIAL LEADERBOARD — ${ttData.event.track}`)
                .setDescription(`**Car:** ${ttData.event.car}\n**Deadline:** ${ttData.event.deadline}\n\n${boardText}`)
                .setColor('#FFCC00')
                .setFooter({ text: 'Future Champions Social Club • Standings' })
                .setTimestamp();

            return interaction.reply({ embeds: [boardEmbed] });
        }

        // ==========================================
        // 4. CLEAR LEADERBOARD
        // ==========================================
        if (subcommand === 'clear') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) {
                return interaction.reply({ content: '❌ You need Manage Events permissions to clear the Time Trial leaderboard.', ephemeral: true });
            }

            ttData.event = null;
            ttData.submissions = {};
            saveTTData(ttData);

            const clearEmbed = new EmbedBuilder()
                .setTitle('🧹 LEADERBOARD RESET')
                .setDescription('The Time Trial event and all submitted lap times have been cleared. Ready for the next event!')
                .setColor('#FF3333')
                .setFooter({ text: 'Future Champions Social Club • Admin Utilities' })
                .setTimestamp();

            return interaction.reply({ embeds: [clearEmbed] });
        }
    }
};
