const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-goodbye')
        .setDescription('Configure custom goodbye messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send goodbye messages')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Goodbye message text (Use {username} for member name)')
                .setRequired(true)),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const customMessage = interaction.options.getString('message');

        interaction.client.goodbyeConfig = {
            channelId: channel.id,
            message: customMessage
        };

        const previewEmbed = new EmbedBuilder()
            .setTitle('👋 MEMBER LEFT')
            .setDescription(customMessage.replace('{username}', interaction.user.username))
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor('#FF3333')
            .setFooter({ text: 'Future Champions Social Club' });

        await interaction.reply({
            content: `✅ **Goodbye message set for ${channel}!** Here is a preview:`,
            embeds: [previewEmbed],
            ephemeral: true
        });
    }
};
