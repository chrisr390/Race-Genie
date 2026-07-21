const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    PermissionFlagsBits 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-calendar')
        .setDescription('Dynamically build and publish a series race calendar')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

    async execute(interaction) {
        // Step 1: Frequency Selector
        const freqSelect = new StringSelectMenuBuilder()
            .setCustomId('cal_freq')
            .setPlaceholder('Select Race Frequency')
            .addOptions([
                { label: 'Weekly', value: 'Weekly' },
                { label: 'Bi-Weekly (Fortnightly)', value: 'Bi-Weekly' },
                { label: 'Monthly', value: 'Monthly' },
            ]);

        const row1 = new ActionRowBuilder().addComponents(freqSelect);

        const nextBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cal_next')
                .setLabel('Next: Setup Series Details ➔')
                .setStyle(ButtonStyle.Primary)
        );

        const response = await interaction.reply({
            content: '⚙️ **FCSC Dynamic Calendar Generator**\nSelect the race frequency below:',
            components: [row1, nextBtn],
            ephemeral: true
        });

        let selectedFreq = 'Weekly';

        const collector = response.createMessageComponentCollector();

        collector.on('collect', async (i) => {
            if (i.isStringSelectMenu()) {
                if (i.customId === 'cal_freq') selectedFreq = i.values[0];
                await i.deferUpdate();
            } else if (i.isButton() && i.customId === 'cal_next') {
                // Initial Modal: Ask for Series Name and Total Rounds (1-15)
                const setupModal = new ModalBuilder()
                    .setCustomId('cal_setup_modal')
                    .setTitle('Series Setup');

                const seriesInput = new TextInputBuilder()
                    .setCustomId('series_name')
                    .setLabel('Series / Championship Name')
                    .setPlaceholder('e.g., FCSC Touring Car Championship')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const roundsInput = new TextInputBuilder()
                    .setCustomId('total_rounds')
                    .setLabel('Number of Rounds (1 to 15)')
                    .setPlaceholder('Type a number from 1 to 15')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                setupModal.addComponents(
                    new ActionRowBuilder().addComponents(seriesInput),
                    new ActionRowBuilder().addComponents(roundsInput)
                );

                await i.showModal(setupModal);

                try {
                    const setupSubmit = await i.awaitModalSubmit({ time: 120000 });
                    
                    const userSeriesName = setupSubmit.fields.getTextInputValue('series_name');
                    let roundCount = parseInt(setupSubmit.fields.getTextInputValue('total_rounds'));

                    // Clamp round count between 1 and 15
                    if (isNaN(roundCount) || roundCount < 1) roundCount = 1;
                    if (roundCount > 15) roundCount = 15;

                    // Discord modals can only fit 5 input fields per pop-up window!
                    // If roundCount > 4, we collect tracks via paragraph format to handle up to 15 rounds easily.
                    if (roundCount <= 4) {
                        const tracksModal = new ModalBuilder()
                            .setCustomId('tracks_modal')
                            .setTitle(`Tracks for ${userSeriesName.substring(0, 20)}`);

                        for (let r = 1; r <= roundCount; r++) {
                            const trackInput = new TextInputBuilder()
                                .setCustomId(`track_r${r}`)
                                .setLabel(`Round ${r} Track & Layout`)
                                .setPlaceholder(`e.g., Brands Hatch GP`)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true);

                            tracksModal.addComponents(new ActionRowBuilder().addComponents(trackInput));
                        }

                        await setupSubmit.showModal(tracksModal);
                        const tracksSubmit = await setupSubmit.awaitModalSubmit({ time: 180000 });

                        const calendarEmbed = new EmbedBuilder()
                            .setTitle(`🗓️ ${userSeriesName.toUpperCase()} CALENDAR`)
                            .setDescription(`**Race Frequency:** ${selectedFreq}\nAll times subject to room host announcements in BST.`)
                            .setColor('#4CE600')
                            .setFooter({ text: 'Future Champions Social Club • Official Schedule' });

                        for (let r = 1; r <= roundCount; r++) {
                            const trackName = tracksSubmit.fields.getTextInputValue(`track_r${r}`);
                            calendarEmbed.addFields({
                                name: `🏁 Round ${r}`,
                                value: `📍 **Track:** ${trackName}\n📅 **Frequency:** ${selectedFreq}`,
                                inline: false
                            });
                        }

                        await tracksSubmit.reply({ content: '✅ Calendar generated and published successfully!', ephemeral: true });
                        await interaction.channel.send({ embeds: [calendarEmbed] });

                    } else {
                        // For 5 to 15 rounds, use one clean Paragraph text box so Discord's 5-field limit doesn't crash the modal
                        const bulkModal = new ModalBuilder()
                            .setCustomId('bulk_tracks_modal')
                            .setTitle(`Tracks list (${roundCount} Rounds)`);

                        const bulkInput = new TextInputBuilder()
                            .setCustomId('bulk_tracks_list')
                            .setLabel(`Enter Track Names (1 per line for ${roundCount} rounds)`)
                            .setPlaceholder('Brands Hatch GP\nSilverstone National\nSpa-Francorchamps\nMonza...')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        bulkModal.addComponents(new ActionRowBuilder().addComponents(bulkInput));

                        await setupSubmit.showModal(bulkModal);
                        const bulkSubmit = await setupSubmit.awaitModalSubmit({ time: 180000 });

                        const rawTracks = bulkSubmit.fields.getTextInputValue('bulk_tracks_list').split('\n').filter(t => t.trim() !== '');

                        const calendarEmbed = new EmbedBuilder()
                            .setTitle(`🗓️ ${userSeriesName.toUpperCase()} CALENDAR`)
                            .setDescription(`**Race Frequency:** ${selectedFreq}\nAll times subject to room host announcements in BST.`)
                            .setColor('#4CE600')
                            .setFooter({ text: 'Future Champions Social Club • Official Schedule' });

                        for (let r = 1; r <= roundCount; r++) {
                            const trackName = rawTracks[r - 1] || 'TBD';
                            calendarEmbed.addFields({
                                name: `🏁 Round ${r}`,
                                value: `📍 **Track:** ${trackName}\n📅 **Frequency:** ${selectedFreq}`,
                                inline: false
                            });
                        }

                        await bulkSubmit.reply({ content: '✅ Calendar generated and published successfully!', ephemeral: true });
                        await interaction.channel.send({ embeds: [calendarEmbed] });
                    }

                } catch (err) {
                    console.log('Modal workflow error or timeout:', err);
                }
            }
        });
    }
};
