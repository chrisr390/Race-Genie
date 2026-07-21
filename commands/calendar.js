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
            option.setName('frequency')
                .setDescription('Race frequency (e.g. Weekly, Bi-Weekly, Every Sunday)')
                .setRequired(true)),

    async execute(interaction) {
        const seriesName = interaction.options.getString('series');
        const frequency = interaction.options.getString('frequency');

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
            const modalSubmit = await interaction.awaitModalSubmit({ time: 300000 }); // 5 minutes to complete

            const rawTracks = modalSubmit.fields.getTextInputValue('tracks_list');
            const tracks = rawTracks.split('\n').map(t => t.trim()).filter(t => t.length > 0);

            if (tracks.length === 0) {
                return await modalSubmit.reply({ content: '❌ You must enter at least 1 track.', ephemeral: true });
            }

            // Limit maximum rounds to 15
            const roundCount = Math.min(tracks.length, 15);

            // Step 4: Build and Send Final Embed
            const calendarEmbed = new EmbedBuilder()
                .setTitle(`🗓️ ${seriesName.toUpperCase()} CALENDAR`)
                .setDescription(`**Race Frequency:** ${frequency}\nAll times subject to room host announcements in BST.`)
                .setColor('#4CE600') // FCSC Lime Green Accent
                .setFooter({ text: 'Future Champions Social Club • Official Schedule' });

            for (let r = 1; r <= roundCount; r++) {
                calendarEmbed.addFields({
                    name: `🏁 Round ${r}`,
                    value: `📍 **Track:** ${tracks[r - 1]}\n📅 **Frequency:** ${frequency}`,
                    inline: false
                });
            }

            await modalSubmit.reply({ content: '✅ Calendar generated and published successfully!', ephemeral: true });
            await interaction.channel.send({ embeds: [calendarEmbed] });

        } catch (err) {
            console.error('Calendar modal submission error or timeout:', err);
        }
    }
};
