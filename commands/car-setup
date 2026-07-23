const { SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('car-setup')
    .setDescription('Generate a customized GT7 car setup sheet or analyze garage telemetry.')
    .addStringOption(option => 
      option.setName('car')
        .setDescription('Car Model & Year (e.g. Porsche 911 GT3 RS)')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('track')
        .setDescription('Track Name & Layout (e.g. Brands Hatch National)')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('drivetrain')
        .setDescription('Drivetrain layout (FF, FR, MR, AWD, RR)')
        .setRequired(true)
        .addChoices(
          { name: 'FF (Front-Engine, Front-Wheel Drive)', value: 'FF' },
          { name: 'FR (Front-Engine, Rear-Wheel Drive)', value: 'FR' },
          { name: 'MR (Mid-Engine, Rear-Wheel Drive)', value: 'MR' },
          { name: 'AWD (All-Wheel Drive)', value: 'AWD' },
          { name: 'RR (Rear-Engine, Rear-Wheel Drive)', value: 'RR' }
        ))
    .addStringOption(option => 
      option.setName('tyres')
        .setDescription('Tyre Compound')
        .setRequired(true)
        .addChoices(
          { name: 'Racing Hard (RH)', value: 'RH' },
          { name: 'Racing Medium (RM)', value: 'RM' },
          { name: 'Racing Soft (RS)', value: 'RS' },
          { name: 'Intermediate / Wet', value: 'WET' }
        ))
    .addStringOption(option => 
      option.setName('handling_issue')
        .setDescription('Primary issue you want to resolve')
        .setRequired(false))
    .addAttachmentOption(option => 
      option.setName('screenshot')
        .setDescription('Optional GT7 garage tuning sheet screenshot for visual analysis')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const car = interaction.options.getString('car');
    const track = interaction.options.getString('track');
    const drivetrain = interaction.options.getString('drivetrain');
    const tyres = interaction.options.getString('tyres');
    const issue = interaction.options.getString('handling_issue') || 'General balance and pace optimization';
    const screenshot = interaction.options.getAttachment('screenshot');

    try {
      const model = genAI.getGenerativeAIModel({ model: 'gemini-2.5-flash-lite' });

      let prompt = `You are an expert Gran Turismo 7 (GT7) Race Engineer calibrated with FLUX89 physics rules. 
Provide precise click-by-click tuning advice for:
- Car: ${car}
- Drivetrain: ${drivetrain}
- Track: ${track}
- Tyres: ${tyres}
- Driver Complaint/Goal: ${issue}

Format the response into clear sections:
1. Suspension (Ride Height, Anti-Roll Bars, Damping, Natural Frequency)
2. Differential / LSD (Initial Torque, Acceleration Sensitivity, Braking Sensitivity)
3. Downforce & Aerodynamics
4. ECU / Power Limiter & Transmission Adjustments
5. Driving Technique Notes for ${track}`;

      let result;
      if (screenshot) {
        const imageResp = await fetch(screenshot.url);
        const arrayBuffer = await imageResp.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString('base64');

        result = await model.generateContent([
          prompt + "\nAnalyze the attached garage tuning screenshot and recommend specific adjustments based on current numbers.",
          { inlineData: { data: base64Image, mimeType: screenshot.contentType || 'image/png' } }
        ]);
      } else {
        result = await model.generateContent(prompt);
      }

      const adviceText = result.response.text();
      const user = interaction.user;
      const chunks = adviceText.match(/[\s\S]{1,1900}/g) || [adviceText];

      await user.send(`🏎️ **GT7 Race Engineer Setup Sheet**\n**Car:** ${car} | **Track:** ${track} | **Tyres:** ${tyres}`);
      for (const chunk of chunks) {
        await user.send(chunk);
      }

      await interaction.editReply({ content: "🏁 *Check your DMs for the setup sheet.*" });

    } catch (err) {
      console.error("Setup generation error:", err);
      await interaction.editReply({ content: "⚠️ *Engineering link dropped. Please try again.*" });
    }
  }
};
