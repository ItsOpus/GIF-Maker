/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, Modality} from '@google/genai';
import {applyPalette, GIFEncoder, quantize} from 'gifenc';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const fps = 4;

// DOM elements
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const generateButton = document.getElementById(
  'generate-button',
) as HTMLButtonElement;
const framesContainer = document.getElementById(
  'frames-container',
) as HTMLDivElement;
const resultContainer = document.getElementById(
  'result-container',
) as HTMLDivElement;
const statusDisplay = document.getElementById(
  'status-display',
) as HTMLDivElement;
const generationContainer = document.querySelector(
  '.generation-container',
) as HTMLDivElement;
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

function parseError(error: string) {
  const regex = /{"error":(.*)}/gm;
  const m = regex.exec(error);
  try {
    const e = m[1];
    const err = JSON.parse(e);
    return err.message;
  } catch (e) {
    return error;
  }
}

async function createGifFromPngs(
  imageUrls: string[],
  targetWidth = 1024,
  targetHeight = 1024,
) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }
  const gif = GIFEncoder();
  const fpsInterval = 1 / fps;
  const delay = fpsInterval * 1000;

  for (const url of imageUrls) {
    const img = new Image();
    img.src = url;
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.fillStyle = '#ffffff';
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const data = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
    const format = 'rgb444';
    const palette = quantize(data, 256, {format});
    const index = applyPalette(data, palette, format);
    gif.writeFrame(index, targetWidth, targetHeight, {palette, delay});
  }

  gif.finish();
  const buffer = gif.bytesView();
  const blob = new Blob([buffer], {type: 'image/gif'});
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  return img;
}

function updateStatus(message: string, progress = 0) {
  if (statusDisplay) {
    statusDisplay.textContent = message;
  }
}

function switchTab(targetTab: string) {
  tabButtons.forEach((button) => {
    if (button.getAttribute('data-tab') === targetTab) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
  tabContents.forEach((content) => {
    if (content.id === `${targetTab}-content`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
  if (targetTab === 'output' && resultContainer) {
    resultContainer.style.display = 'flex';
  }
}

async function run(value: string) {
  if (framesContainer) framesContainer.textContent = '';
  if (resultContainer) resultContainer.textContent = '';
  resultContainer?.classList.remove('appear');
  switchTab('frames');
  if (resultContainer) resultContainer.style.display = 'none';

  updateStatus('Tớ đang tạo khung hình nè! Đợi tớ xíu nha! 🥰');
  if (generateButton) {
    generateButton.disabled = true;
    generateButton.classList.add('loading');
  }

  try {
    const expandPromptResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: value,
      config: {
        temperature: 1,
        systemInstruction: `**Generate simple, animated doodle GIFs on white from user input, prioritizing key visual identifiers in an animated doodle style with ethical considerations.**
**Core GIF:** Doodle/cartoonish (simple lines, stylized forms, no photorealism), subtle looping motion (primary subject(s) only: wiggle, shimmer, etc.), white background, lighthearted/positive tone (playful, avoids trivializing serious subjects), uses specified colors (unless monochrome/outline requested).
**Input Analysis:** Identify subject (type, specificity), prioritize visual attributes (hair C/T, skin tone neutrally if discernible/needed, clothes C/P, accessories C, facial hair type, other distinct features neutrally for people; breed, fur C/P for animals; key parts, colors for objects), extract text (content, style hints described, display as requested: speech bubble [format: 'Speech bubble says "[Text]" is persistent.'], caption/title [format: 'with the [title/caption] "[Text]" [position]'], or text-as-subject [format: 'the word "[Text]" in [style/color description]']), note style modifiers (e.g., "pencil sketch," "monochrome"), and action (usually "subtle motion"). If the subject or description is too vague, add specific characteristics to make it more unique and detailed.
**Prompt Template:** "[Style Descriptor(s)] [Subject Description with Specificity, Attributes, Colors, Skin Tone if applicable] [Text Component if applicable and NOT speech bubble]. [Speech Bubble Component if applicable]"
**Template Notes:** '[Style Descriptor(s)]' includes "cartoonish" or "doodle style" (especially for people) plus any user-requested modifiers. '[Subject Description...]' combines all relevant subject and attribute details. '[Text Component...]' is for captions, titles, or text-as-subject only. '[Speech Bubble Component...]' is for speech bubbles only (mutually exclusive with Text Component).
**Key Constraints:** No racial labels. Neutral skin tone descriptors when included. Cartoonish/doodle style always implied, especially for people. One text display method only.`,
      },
    });

    const prompt = `A doodle animation on a white background of ${expandPromptResponse.text}. Subtle motion but nothing else moves.`;
    const style = `Simple, vibrant, varied-colored doodle/hand-drawn sketch`;

    const response = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: `Generate at least 10 square, white-background doodle animation frames with smooth, fluid, vibrantly colored motion depicting ${prompt}.

*Mandatory Requirements (Compacted):**

**Style:** ${style}.
**Background:** Plain solid white (no background colors/elements). Absolutely no black background.
**Content & Motion:** Clearly depict **{{prompt}}** action with colored, moving subject (no static images). If there's an action specified, it should be the main difference between frames.
**Frame Count:** At least 5 frames showing continuous progression and at most 20 frames.
**Format:** Square image (1:1 aspect ratio).
**Cropping:** Absolutely no black bars/letterboxing; colorful doodle fully visible against white.
**Output:** Actual image files for a smooth, colorful doodle-style GIF on a white background. Make sure every frame is different enough from the previous one.`,
      config: {
        temperature: 1,
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });
    const images = [];
    let frameCount = 0;

    for await (const chunk of response) {
      if (chunk.candidates && chunk.candidates[0].content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          if (part.inlineData && framesContainer) {
            frameCount++;
            updateStatus(`Òmm! Tớ đã tạo được khung hình thứ ${frameCount} rùi né! Dui hem? Dui hem?`);

            // Create a frame element for our UI
            const frameElement = document.createElement('div');
            frameElement.className = 'frame';

            // Create and add the frame number
            const frameNumber = document.createElement('div');
            frameNumber.className = 'frame-number';
            frameNumber.textContent = frameCount.toString();
            frameElement.appendChild(frameNumber);

            // Create the image as in the original
            const src = `data:image/png;base64,${part.inlineData.data}`;
            const img = document.createElement('img');
            img.width = 1024;
            img.height = 1024;
            img.src = src;

            // Add it to our frame element
            frameElement.appendChild(img);
            framesContainer.appendChild(frameElement);

            // Store URL for GIF creation
            images.push(src);

            // Animate the frame appearance
            setTimeout(() => {
              frameElement.classList.add('appear');
            }, 50);
          }
        }
      }
    }

    if (frameCount < 2) {
      updateStatus('Ơ kìa! Tạo lỗi rùi! Bạn thử lại prompt khác nhe! Cho bạn cục kẹo ăn đỡ buồn nè. 🍬');
      return false;
    }

    // Update status
    updateStatus('Tớ đang tạo nè! Bạn đợi xíu thôi nha. Ăn kẹo khom? 🍭');

    // Create the GIF just like in the original
    const img = await createGifFromPngs(images);
    img.className = 'result-image';

    // Clear and add to result container
    if (resultContainer) {
      resultContainer.appendChild(img);

      // Add download button
      const downloadButton = document.createElement('button');
      downloadButton.className = 'download-button';
      const icon = document.createElement('i');
      icon.className = 'fas fa-download';
      downloadButton.appendChild(icon);
      downloadButton.onclick = () => {
        const a = document.createElement('a') as HTMLAnchorElement;
        a.href = img.src;
        a.download = 'bemzaidepchai.gif';
        a.click();
      };
      resultContainer.appendChild(downloadButton);

      switchTab('output');
      setTimeout(() => {
        resultContainer.classList.add('appear');
        generationContainer.scrollIntoView({behavior: 'smooth'});
      }, 50);
    }

    updateStatus('Xong rùi né! Nắng lên rùi 🌞');
  } catch (error) {
    const msg = parseError(error);
    console.error('Error generating animation:', error);
    updateStatus(`Ơ này! Lỗi rùi. Mã lỗi là [${msg}]. Bạn vui lòng liên hệ tớ để sửa lỗi nhe! Tớ luôn sẵn sàng nè! Ahihi`);
    return false;
  } finally {
    if (generateButton) {
      generateButton.disabled = false;
      generateButton.classList.remove('loading');
    }
  }
  return true;
}

// Initialize the app
function main() {
  if (generateButton) {
    generateButton.addEventListener('click', async () => {
      if (promptInput) {
        const value = promptInput.value.trim();
        if (value) {
          const retries = 3;
          for (let i = 0; i < retries; i++) {
            if (await run(value)) {
              console.log('Xong rồi nè! Nắng lên rồi! ☀️');
              return;
            } else {
              console.log(`Ơ kìa! Lỗi rùi! Tớ phải thử lại nè!`);
            }
          }
          console.log('Ơ! Lỗi rùi! Bạn thử lại sau nè!');
        }
      }
    });
  }

  if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        generateButton?.click();
      }
    });
    promptInput.addEventListener('focus', (e) => {
      promptInput.select();
      e.preventDefault();
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      if (targetTab) switchTab(targetTab);
    });
  });

  switchTab('frames');
}

main();
