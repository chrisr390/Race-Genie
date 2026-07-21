const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkin')
        .setDescription('Open race day check-in for tonight\'s grid!'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🏎️ FCSC RACE DAY CHECK-IN')
            .setDescription('Please confirm your attendance for tonight\'s race! Check-in closes 30 minutes before lights out.')
            .setColor('#6B1FB3') // Server Metallic Purple
            .addFields(
                { name: '🟢 Confirmed (0)', value: 'None yet', inline: true },
                { name: '🟡 Reserve (0)', value: 'None yet', inline: true },
                { name: '🔴 Out (0)', value: 'None yet', inline: true }
            )
            .setFooter({ text: 'Future Champions Social Club • Tap a button below to set your status' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('checkin_in')
                .setLabel('Attending')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🏎️'),
            new ButtonBuilder()
                .setCustomId('checkin_reserve')
                .setLabel('Reserve')
                .setStyle(ButtonStyle.Warning)
                .setEmoji('⏳'),
            new ButtonBuilder()
                .setCustomId('checkin_out')
                .setLabel('Can\'t Make It')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

        const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        const collector = response.createMessageComponentCollector();

        collector.on('collect', async (buttonInteraction) => {
            const currentEmbed = response.embeds[0];
            if (!currentEmbed) return;

            const parseDrivers = (fieldValue) => {
                if (fieldValue === 'None yet') return [];
                return fieldValue.split('\n');
            };

            let attending = parseDrivers(currentEmbed.fields[0].value);
            let reserves = parseDrivers(currentEmbed.fields[1].value);
            let missing = parseDrivers(currentEmbed.fields[2].value);

            const driverMention = `<@${buttonInteraction.user.id}>`;

            attending = attending.filter(d => d !== driverMention);
            reserves = reserves.filter(d => d !== driverMention);
            missing = missing.filter(d => d !== driverMention);

            if (buttonInteraction.customId === 'checkin_in') attending.push(driverMention);
            if (buttonInteraction.customId === 'checkin_reserve') reserves.push(driverMention);
            if (buttonInteraction.customId === 'checkin_out') missing.push(driverMention);

            const formatField = (list) => list.length > 0 ? list.join('\n') : 'None yet';

            const updatedEmbed = EmbedBuilder.from(currentEmbed).setFields(
                { name: `🟢 Confirmed (${attending.length})`, value: formatField(attending), inline: true },
                { name: `🟡 Reserve (${reserves.length})`, value: formatField(reserves), inline: true },
                { name: `🔴 Out (${missing.length})`, value: formatField(missing), inline: true }
            );

            await buttonInteraction.update({ embeds: [updatedEmbed] });
        });
    }
};
