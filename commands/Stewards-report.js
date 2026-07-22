const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('steward-report')
        .setDescription('Submit an incident report for steward review'),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('steward_report_modal')
            .setTitle('🏎️ Steward Incident Report');

        const raceInput = new TextInputBuilder()
            .setCustomId('incident_race')
            .setLabel('Event & Lap Number')
            .setPlaceholder('e.g., Round 3 - Nürburgring GP, Lap 4')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const driversInput = new TextInputBuilder()
            .setCustomId('incident_drivers')
            .setLabel('Drivers Involved (PSN / Tag)')
            .setPlaceholder('e.g., DriverA vs DriverB')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('incident_desc')
            .setLabel('Incident Description & Replay Time Stamp')
            .setPlaceholder('Describe what happened and specify the replay time (e.g., 04:15 into race)...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(raceInput),
            new ActionRowBuilder().addComponents(driversInput),
            new ActionRowBuilder().addComponents(descriptionInput)
        );

        await interaction.showModal(modal);
    }
};
