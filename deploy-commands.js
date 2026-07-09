const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { DISCORD_TOKEN } = require('./config');

// 🔧 Hardcoded Target Configuration for FCSC Server Deployment
const CLIENT_ID = '1177651662970425374'; // Your bot application client ID
const GUILD_ID = '1169720521235902495';  // Your target server server ID

// Define the command configurations
const commands = [
    new SlashCommandBuilder()
        .setName('car-setup')
        .setDescription('Initialize a custom race engineering tuning profile.')
        .addStringOption(option =>
            option.setName('car')
                .setDescription('Select the vehicle you want to tune')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('track')
                .setDescription('Select the circuit layout')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('tyres') // 🏎️ THE NEW TYRE DROP-DOWN OPTION
                .setDescription('Select your current tyre compound')
                .setRequired(true)
                .addChoices(
                    { name: 'Racing: Soft (RS)', value: 'Racing Soft' },
                    { name: 'Racing: Medium (RM)', value: 'Racing Medium' },
                    { name: 'Racing: Hard (RH)', value: 'Racing Hard' },
                    { name: 'Sports: Soft (SS)', value: 'Sports Soft' },
                    { name: 'Sports: Medium (SM)', value: 'Sports Medium' },
                    { name: 'Sports: Hard (SH)', value: 'Sports Hard' },
                    { name: 'Comfort: Soft (CS)', value: 'Comfort Soft' },
                    { name: 'Comfort: Medium (CM)', value: 'Comfort Medium' },
                    { name: 'Comfort: Hard (CH)', value: 'Comfort Hard' },
                    { name: 'Racing: Intermediates (IM)', value: 'Intermediates' },
                    { name: 'Racing: Heavy Wet (W)', value: 'Heavy Wet' }
                ))
        .addStringOption(option =>
            option.setName('weather')
                .setDescription('Current track surface conditions (e.g., Light Rain, Optimal)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('drivetrain')
                .setDescription('Vehicle layout configuration (e.g., FR, 4WD, MR)')
                .setRequired(false))
       .addStringOption(option =>
    option.setName('downforce')
        .setDescription('Enter downforce levels (e.g., 3.0 front, 0.8 rear or 300/500)')
        .setRequired(false))
        .addStringOption(option =>
            option.setName('regulations')
                .setDescription('Active event target constraints (e.g., 600 PP, 700 PP)')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('screenshot')
                .setDescription('Upload a picture of your current settings sheet')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Wipe active chat memory caches and reset handling parameters back to engineering baseline.')
].map(command => command.toJSON());

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// Instantly deploy the registration bundle directly to Discord's server systems
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands for guild ${GUILD_ID}.`);

        // This route pushes changes immediately straight to your specific server cache
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error("Slash Command Registration Refusal Error:", error);
    }
})();
