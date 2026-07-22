const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('host-announce')
        .setDescription('Broadcast official lobby code and track conditions')
        .addStringOption(option =>
            option.setName('room-code')
                .setDescription('Lobby / Room Code or ID')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('track')
                .setDescription('Track & Layout')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('car-class')
                .setDescription('Vehicle Class (e.g., Gr.3, TCR, Mono-spec)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('conditions')
                .setDescription('Weather / Track Conditions (e.g., Fine/Dry, Light Rain)')
                .setRequired(false)),

    async execute(interaction) {
        const roomCode = interaction.options.getString('room-code');
        const track = interaction.options.getString('track');
        const carClass = interaction.options.getString('car-class');
        const conditions = interaction.options.getString('conditions') || 'Standard Dry';

        const hostEmbed = new EmbedBuilder()
            .setTitle('🏁 LOBBY IS NOW OPEN!')
            .setDescription(`Official lobby details for tonight's event. Please join promptly!`)
            .addFields(
                { name: '🔑 Room Code / ID', value: `\`\`\`${roomCode}\`\`\``, inline: false },
                { name: '📍 Track & Layout', value: track, inline: true },
                { name: '🏎️ Car Class', value: carClass, inline: true },
                { name: '🌤️ Weather / Conditions', value: conditions, inline: true }
            )
            .setColor('#4CE600') // Signature Lime Green
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .setFooter({ text: 'Future Champions Social Club • Official Lobby Host' })
            .setTimestamp();

        await interaction.reply({
            content: '@everyone **Lobby is open! Check details below:**',
            embeds: [hostEmbed]
        });
    }
};
