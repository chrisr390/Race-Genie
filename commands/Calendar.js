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
        // Step 1: Create Series Selector
        const seriesSelect = new StringSelectMenuBuilder()
            .setCustomId('cal_series')
            .setPlaceholder('Select Championship / Series')
            .addOptions([
                { label: 'TCR Championship', value: 'TCR Championship', emoji: '🏎️' },
                { label: 'GT3 Challenge', value: 'GT3 Challenge', emoji: '🏆' },
                { label: 'MX-5 Cup', value: 'MX-5 Cup', emoji: '🚗' },
                { label: 'Custom Series', value: 'Custom Series', emoji: '⚙️' },
            ]);

        // Step 2: Create Rounds Selector
        const roundsSelect = new StringSelectMenuBuilder()
            .setCustomId('cal_rounds')
            .setPlaceholder('Select Number of Rounds')
            .addOptions([
                { label: '3 Rounds', value: '3' },
                { label: '4 Rounds', value: '4' },
                { label: '5 Rounds', value: '5' },
            ]);

        // Step 3: Create Frequency Selector
        const freqSelect = new StringSelectMenuBuilder()
            .setCustomId('cal_freq')
            .setPlaceholder('Select Race Frequency')
            .addOptions([
                { label: 'Weekly', value: 'Weekly' },
                { label: 'Bi-Weekly (Fortnightly)', value: 'Bi-Weekly' },
                { label: 'Monthly', value: 'Monthly' },
            ]);

        const row1 = new ActionRowBuilder().addComponents(seriesSelect);
        const row2 = new ActionRowBuilder().addComponents(roundsSelect);
        const row3 = new ActionRowBuilder().addComponents(freqSelect);

        const nextBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cal_next')
                .setLabel('Next: Input Track Names ➔')
                .setStyle(ButtonStyle.Primary)
        );

        const response = await interaction.reply({
            content: '⚙️ **FCSC Dynamic Calendar Generator**\nPlease configure your series settings below:',
            components: [row1, row2, row3, nextBtn],
            ephemeral: true
        });

        // Store selected options in memory for this session
        let selectedSeries = 'TCR Championship';
        let selectedRounds = 3;
        let selectedFreq = 'Weekly';

        const collector = response.createMessageComponentCollector();

        collector.on('collect', async (i) => {
            if (i.isStringSelectMenu()) {
                if (i.customId === 'cal_series') selectedSeries = i.values[0];
                if (i.customId === 'cal_rounds') selectedRounds = parseInt(i.values[0]);
                if (i.customId === 'cal_freq') selectedFreq = i.values[0];
                await i.deferUpdate();
            } else if (i.isButton() && i.customId === 'cal_next') {
                // Open Modal Form for Tracks
                const modal = new ModalBuilder()
                    .setCustomId('cal_modal')
                    .setTitle(`Tracks for ${selectedSeries}`);

                for (let r = 1; r <= selectedRounds; r++) {
                    const trackInput = new TextInputBuilder()
                        .setCustomId(`track_r${r}`)
                        .setLabel(`Round ${r} Track Name & Layout`)
                        .setPlaceholder(`e.g., Brands Hatch GP`)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(trackInput));
                }

                await i.showModal(modal);

                // Catch Modal Submission
                try {
                    const modalSubmit = await i.awaitModalSubmit({ time: 120000 });
                    
                    const calendarEmbed = new EmbedBuilder()
                        .setTitle(`🗓️ ${selectedSeries.toUpperCase()} CALENDAR`)
                        .setDescription(`**Schedule Format:** ${selectedFreq}\nAll race times subject to room host announcements in BST.`)
                        .setColor('#4CE600')
                        .setFooter({ text: 'Future Champions Social Club • Dynamic Schedule' });

                    for (let r = 1; r <= selectedRounds; r++) {
                        const trackName = modalSubmit.fields.getTextInputValue(`track_r${r}`);
                        calendarEmbed.addFields({
                            name: `🏁 Round ${r}`,
                            value: `📍 **Track:** ${trackName}\n📅 **Frequency:** ${selectedFreq}`,
                            inline: false
                        });
                    }

                    await modalSubmit.reply({
                        content: '✅ Calendar generated and posted!',
                        ephemeral: true
                    });

                    // Post to channel
                    await interaction.channel.send({ embeds: [calendarEmbed] });

                } catch (err) {
                    console.log('Modal timeout or error:', err);
                }
            }
        });
    }
};
