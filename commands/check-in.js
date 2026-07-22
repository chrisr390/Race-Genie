const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkin')
        .setDescription('Check in for an upcoming race event')
        .addStringOption(option =>
            option.setName('psn')
                .setDescription('Your PSN ID / Gamer Tag')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('car')
                .setDescription('Your selected vehicle / livery number')
                .setRequired(false)),

    async execute(interaction) {
        try {
            const psnId = interaction.options.getString('psn');
            const carChoice = interaction.options.getString('car') || 'Not specified';

            const checkinEmbed = new EmbedBuilder()
                .setTitle('🏎️ RACE CHECK-IN CONFIRMED')
                .setDescription(`**Driver:** ${interaction.user}\n**PSN ID:** \`${psnId}\`\n**Car / Livery:** ${carChoice}`)
                .setColor('#4CE600') // Signature Lime Green
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'Future Champions Social Club • Race Check-In' })
                .setTimestamp();

            await interaction.reply({
                content: `✅ Check-in successful for ${interaction.user}!`,
                embeds: [checkinEmbed]
            });
        } catch (error) {
            console.error('Error executing /checkin:', error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '❌ There was an error completing your check-in.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ There was an error completing your check-in.', ephemeral: true });
            }
        }
    }
};
