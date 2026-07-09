const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { DISCORD_TOKEN, CLIENT_ID } = require('./config');

const commands = [
    new SlashCommandBuilder()
        .setName('car-setup')
        .setDescription('Generate an optimized Gran Turismo 7 car setup.')
        .addStringOption(option =>
            option.setName('car')
                .setDescription('The car model')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('track')
                .setDescription('The track layout')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('tyres')
                .setDescription('Select your tyre compound')
                .setRequired(true)
                .addChoices(
                    { name: 'Racing: Soft', value: 'Racing: Soft' },
                    { name: 'Racing: Medium', value: 'Racing: Medium' },
                    { name: 'Racing: Hard', value: 'Racing: Hard' },
                    { name: 'Racing: Intermediate', value: 'Racing: Intermediate' },
                    { name: 'Racing: Heavy Wet', value: 'Racing: Heavy Wet' },
                    { name: 'Sports: Soft', value: 'Sports: Soft' },
                    { name: 'Sports: Medium', value: 'Sports: Medium' },
                    { name: 'Sports: Hard', value: 'Sports: Hard' },
                    { name: 'Comfort: Soft', value: 'Comfort: Soft' },
                    { name: 'Comfort: Medium', value: 'Comfort: Medium' },
                    { name: 'Comfort: Hard', value: 'Comfort: Hard' }
                ))
        .addStringOption(option =>
            option.setName('drivetrain')
                .setDescription('Drivetrain layout (FR, FF, MR, 4WD)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('downforce')
                .setDescription('Enter downforce levels (e.g., 3.0 front, 0.8 rear or 300/500)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('weather')
                .setDescription('Track weather and track conditions')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('regulations')
                .setDescription('BoP, PP limits, or tuning restrictions')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('screenshot')
                .setDescription('Optional telemetry or current setup screenshot')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Clear your active engineering session memory.')
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands from scratch.');
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
})();
