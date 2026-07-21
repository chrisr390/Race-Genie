const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    PermissionFlagsBits 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-calendar')
        .setDescription('Dynamically build and publish a series race calendar')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
        .addStringOption(option => 
            option.setName('series')
                .setDescription('Name of the Championship / Series (e.g. FCSC TCR Championship)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('racehost')
                .setDescription('PSN ID / Name of the Lobby / Room Host')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('frequency')
                .setDescription('Select frequency interval')
                .setRequired(true)
                .addChoices(
                    { name: 'Weekly (+7 Days)', value: 'Weekly' },
                    { name: 'Bi-Weekly / Fortnightly (+14 Days)', value: 'Bi-Weekly' },
                    { name: 'Monthly (+28 Days)', value: 'Monthly' }
                ))
        .addStringOption(option => 
            option.setName('startdate')
                .setDescription('Round 1 date in YYYY-MM-DD or DD/MM/YYYY format (e.g., 2026-08-01 or 01/08/2026)')
                .setRequired(true)),

    async execute(interaction) {
        const seriesName = interaction.options.getString('series');
        const raceHost = interaction.options.getString('racehost');
        const frequency = interaction.options.getString('frequency');
        const startDateInput = interaction.options.getString('startdate');

        // Helper function to parse user input dates (DD/MM/YYYY or YYYY-MM-DD)
        const parseDate = (str) => {
            if (str.includes('/')) {
                const parts = str.split('/');
                if (parts.length === 3) {
                    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
            }
            return new Date(str);
        };

        // Helper function to resolve color, emoji, and tag by day of week
        const getThemeForDate = (dateObj) => {
            if (!dateObj || isNaN(dateObj.getTime())) {
                return { color: '#2ECC71', emoji: '🟢', tag: 'SPECIAL EVENT' };
            }

            const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, etc.

            switch (dayOfWeek) {
                case 1: // Monday
                    return {
                        color: '#3498DB', // Blue
                        emoji: '🟦',
                        tag: 'MONDAY SERIES'
                    };
                case 2: // Tuesday
                    return {
                        color: '#E67E22', // Orange
                        emoji: '🟧',
                        tag: 'TUESDAY SERIES'
                    };
                default: // Fallback for all other days (Green for Special Events)
                    return {
                        color: '#2ECC71', // Green
                        emoji: '🟩',
                        tag: 'SPECIAL EVENT'
                    };
            }
        };

        const startDateObj = parseDate(startDateInput);
        const isValidDate = !isNaN(startDateObj.getTime());
        const theme = getThemeForDate(startDateObj);

        // Step 1: Create Pop-Up Modal for Tracks List
        const modal = new ModalBuilder()
            .setCustomId('calendar_tracks_modal')
            .setTitle(`Tracks for ${seriesName.substring(0, 20)}`);

        const tracksInput = new TextInputBuilder()
            .setCustomId('tracks_list')
            .setLabel('Enter Track Names (1 per line, up to 15)')
            .setPlaceholder('Brands Hatch GP\nSilverstone National\nSpa-Francorchamps\nMonza GP')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(tracksInput);
        modal.addComponents(row);

        // Step 2: Display Modal to User Immediately
        await interaction.showModal(modal);

        // Step 3: Handle Modal Submission
        try {
            const modalSubmit = await interaction.awaitModalSubmit({ time: 300000 });

            const rawTracks = modalSubmit.fields.getTextInputValue('tracks_list');
            const tracks = rawTracks.split('\n').map(t => t.trim()).filter(t => t.length > 0);

            if (tracks.length === 0) {
                return await modalSubmit.reply({ content: '❌ You must enter at least 1 track.', ephemeral: true });
            }

            const roundCount = Math.min(tracks.length, 15);

            // Determine day increment based on selected frequency
            let dayIncrement = 7;
            if (frequency === 'Bi-Weekly') dayIncrement = 14;
            if (frequency === 'Monthly') dayIncrement = 28;

            // Step 4: Build Final Embed
            const calendarEmbed = new EmbedBuilder()
                .setTitle(`${theme.emoji} ${seriesName.toUpperCase()} CALENDAR`)
                .setDescription(`🏎️ **Format:** ${frequency} | **Category:** ${theme.tag}\n🎙️ **Room Host:** ${raceHost}\n\n*All race times subject to room host announcements in BST.*`)
                .setColor(theme.color)
                .setFooter({ text: `Future Champions Social Club • Host: ${RaceHost}` });

            for (let r = 0; r < roundCount; r++) {
                let dateDisplay = startDateInput;

                if (isValidDate) {
                    const roundDate = new Date(startDateObj);
                    roundDate.setDate(roundDate.getDate() + (r * dayIncrement));
                    
                    dateDisplay = roundDate.toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    });
                }

                calendarEmbed.addFields({
                    name: `🏁 Round ${r + 1}`,
                    value: `📍 **Track:** ${tracks[r]}\n📅 **Date:** ${dateDisplay}`,
                    inline: false
                });
            }

            await modalSubmit.reply({ embeds: [calendarEmbed] });

        } catch (err) {
            console.error('Calendar modal submission error or timeout:', err);
        }
    }
};
