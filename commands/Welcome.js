const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-welcome')
        .setDescription('Configure custom welcome messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send welcome messages')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Welcome message text (Use {user} for member tag, {server} for server name)')
                .setRequired(true)),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const customMessage = interaction.options.getString('message');

        // Store config in client memory
        interaction.client.welcomeConfig = {
            channelId: channel.id,
            message: customMessage
        };

        const previewEmbed = new EmbedBuilder()
            .setTitle('🏁 WELCOME TO FUTURE CHAMPIONS SOCIAL CLUB!')
            .setDescription(customMessage.replace('{user}', interaction.user.toString()).replace('{server}', interaction.guild.name))
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor('#4CE600')
            .setFooter({ text: 'Future Champions Social Club • Clean & Competitive Racing' });

        await interaction.reply({
            content: `✅ **Welcome message set for ${channel}!** Here is a preview:`,
            embeds: [previewEmbed],
            ephemeral: true
        });
    }
};
