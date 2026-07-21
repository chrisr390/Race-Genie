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
        // Step 1: Number of Rounds Selector
        const roundsSelect = new StringSelectMenuBuilder()
            .setCustomId('cal_rounds')
            .setPlaceholder('Select Number of Rounds')
            .addOptions([
                { label: '3 Rounds', value: '3' },
                { label: '4 Rounds', value: '4' },
                { label: '5 Rounds', value: '5' },
            ]);

        // Step 2: Frequency Selector
        const freqSelect = new StringSelectMenuBuilder()
            .setCustomId('cal_freq')
            .setPlaceholder('Select Race Frequency')
            .addOptions([
                { label: 'Weekly', value: 'Weekly' },
                { label: 'Bi-Weekly (Fortnightly)', value: 'Bi-Weekly' },
                { label: 'Monthly', value: 'Monthly' },
            ]);

        const row1 = new ActionRowBuilder().addComponents(roundsSelect);
        const row2 = new ActionRowBuilder().addComponents(freqSelect);

        const nextBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cal_next')
                .setLabel('Next: Enter Series Details & Tracks ➔')
                .setStyle(ButtonStyle.Primary)
        );

        const response = await interaction.reply({
            content: '⚙️ **FCSC Dynamic Calendar Generator**\nSelect the schedule length and frequency below:',
            components: [row1, row2, nextBtn],
            ephemeral: true
        });

        // Default values if unchanged
        let selectedRounds = 3;
        let selectedFreq = 'Weekly';

        const collector = response.createMessageComponentCollector();

        collector.on('collect', async (i) => {
            if (i.isStringSelectMenu()) {
                if (i.customId === 'cal_rounds') selectedRounds = parseInt(i.values[0]);
                if (i.customId === 'cal_freq') selectedFreq = i.values[0];
                await i.deferUpdate();
            } else if (i.isButton() && i.customId === 'cal_next') {
                // Open Modal Form
                const modal = new ModalBuilder()
                    .setCustomId('cal_modal')
                    .setTitle('Series & Track Details');

                // Input 1: Manual Series Name Entry
                const seriesInput = new TextInputBuilder()
                    .setCustomId('series_name')
                    .setLabel('Series / Championship Name')
                    .setPlaceholder('e.g., FCSC Touring Car Championship')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(seriesInput));

                // Dynamic Inputs for Each Round's Track
                for (let r = 1; r <= selectedRounds; r++) {
                    const trackInput = new TextInputBuilder()
                        .setCustomId(`track_r${r}`)
                        .setLabel(`Round ${r} Track & Layout`)
                        .setPlaceholder(`e.g., Brands Hatch GP`)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(trackInput));
                }

                await i.showModal(modal);

                // Catch Modal Submission
                try {
                    const modalSubmit = await i.awaitModalSubmit({ time: 120000 });
                    
                    const userSeriesName = modalSubmit.fields.getTextInputValue('series_name');

                    const calendarEmbed = new EmbedBuilder()
                        .setTitle(`🗓️ ${userSeriesName.toUpperCase()} CALENDAR`)
                        .setDescription(`**Race Frequency:** ${selectedFreq}\nAll times subject to room host announcements in BST.`)
                        .setColor('#4CE600') // Server Accent Lime Green
                        .setFooter({ text: 'Future Champions Social Club • Official Schedule' });

                    for (let r = 1; r <= selectedRounds; r++) {
                        const trackName = modalSubmit.fields.getTextInputValue(`track_r${r}`);
                        calendarEmbed.addFields({
                            name: `🏁 Round ${r}`,
                            value: `📍 **Track:** ${trackName}\n📅 **Frequency:** ${selectedFreq}`,
                            inline: false
                        });
                    }

                    await modalSubmit.reply({
                        content: '✅ Calendar generated and published successfully!',
                        ephemeral: true
                    });

                    // Post finished embed to channel
                    await interaction.channel.send({ embeds: [calendarEmbed] });

                } catch (err) {
                    console.log('Modal submission timeout or error:', err);
                }
            }
        });
    }
};
