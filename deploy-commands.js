const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { DISCORD_TOKEN, CLIENT_ID } = require('./config');

const commands = [
    new SlashCommandBuilder()
        .setName('car-setup')
        .setDescription('Get customized GT7 setup recommendations or review an existing one')
        .addStringOption(option =>
            option.setName('car')
                .setDescription('The car model (e.g., Porsche 911 GT3 RS, Gr.3 Mercedes)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('track')
                .setDescription('The track name (e.g., Spa-Francorchamps, Monza)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('weather')
                .setDescription('Weather conditions (e.g., Dry, Wet, Wet to Dry transition)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('drivetrain')
                .setDescription('Drivetrain layout (if known)')
                .setRequired(false)
                .addChoices(
                    { name: 'FR (Front Engine, Rear Drive)', value: 'FR' },
                    { name: 'MR (Mid Engine, Rear Drive)', value: 'MR' },
                    { name: 'FF (Front Engine, Front Drive)', value: 'FF' },
                    { name: '4WD (Four-Wheel Drive)', value: '4WD' },
                    { name: 'RR (Rear Engine, Rear Drive)', value: 'RR' }
                )
        )
        .addStringOption(option =>
            option.setName('front_downforce')
                .setDescription('Specify Front Min/Max limits if restricted (e.g., Min 100 / Max 200)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('rear_downforce')
                .setDescription('Specify Rear Min/Max limits if restricted (e.g., Min 250 / Max 400)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('regulations')
                .setDescription('Tuning restrictions (e.g., Only camber, aero, and brake balance allowed)')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option.setName('screenshot')
                .setDescription('Upload a screenshot of your current tuning sheet for analysis')
                .setRequired(false)
        ),
        
    new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset your setup conversation memory with Race Genie')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded application (/) commands globally.`);
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
})();
