
const FAL_ENDPOINT = "https://fal.run/fal-ai/vidu/q1/reference-to-video";
let uploadedImages = [];

const uploadArea = document.getElementById("uploadArea");
const imageUpload = document.getElementById("imageUpload");
const uploadedImagesContainer = document.getElementById("uploadedImages");
const generateBtn = document.getElementById("generateBtn");
const statusSection = document.getElementById("statusSection");
const progressFill = document.getElementById("progressFill");
const statusText = document.getElementById("statusText");
const resultSection = document.getElementById("resultSection");
const resultVideo = document.getElementById("resultVideo");
const downloadBtn = document.getElementById("downloadBtn");

uploadArea.addEventListener("click", () => imageUpload.click());
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const files = Array.from(e.dataTransfer.files).filter((file) =>
    file.type.startsWith("image/")
  );
  addImages(files);
});
imageUpload.addEventListener("change", (e) => {
  addImages(Array.from(e.target.files));
});

function addImages(files) {
  files.forEach((file) => {
    if (uploadedImages.length >= 7) {
      alert("Maximum 7 images allowed");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImages.push({
        file,
        dataUrl: e.target.result,
        id: Date.now() + Math.random(),
      });
      renderUploadedImages();
    };
    reader.readAsDataURL(file);
  });
}

function removeImage(id) {
  uploadedImages = uploadedImages.filter((img) => img.id !== id);
  renderUploadedImages();
}

function renderUploadedImages() {
  uploadedImagesContainer.innerHTML = "";
  uploadedImages.forEach((image, index) => {
    const el = document.createElement("div");
    el.className = "image-preview";
    el.innerHTML = \`
      <img src="\${image.dataUrl}" alt="Reference \${index + 1}">
      <button class="remove-btn" onclick="removeImage(\${image.id})">×</button>
      <div class="image-number">\${index + 1}</div>
    \`;
    uploadedImagesContainer.appendChild(el);
  });
  updateGenerateButtonState();
}

function updateGenerateButtonState() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const prompt = document.getElementById("prompt").value.trim();
  const hasImages = uploadedImages.length >= 3;

  generateBtn.disabled = !(apiKey && prompt && hasImages);
}

document.getElementById("apiKey").addEventListener("input", updateGenerateButtonState);
document.getElementById("prompt").addEventListener("input", updateGenerateButtonState);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function makeAPICall(url, apiKey, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Key \${apiKey}\`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(\`API Error \${res.status}: \${await res.text()}\`);
  }
  return res.json();
}

async function pollForResult(requestId, apiKey) {
  const pollEndpoint = \`https://queue.fal.run/fal-ai/vidu/q1/reference-to-video/requests/\${requestId}\`;
  for (let i = 0; i < 60; i++) {
    const res = await fetch(pollEndpoint, {
      headers: { Authorization: \`Key \${apiKey}\` },
    });
    const data = await res.json();
    if (data.status === "COMPLETED") return data;
    if (data.status === "FAILED") throw new Error(data.error || "Generation failed");
    if (data.logs?.length) {
      const lastLog = data.logs[data.logs.length - 1];
      if (lastLog.message) statusText.textContent = lastLog.message;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timeout: Video generation took too long");
}

generateBtn.addEventListener("click", async () => {
  const apiKey = document.getElementById("apiKey").value.trim();
  const prompt = document.getElementById("prompt").value.trim();
  const durationValue = parseInt(document.getElementById("durationValue").value);
  const durationUnit = document.getElementById("durationUnit").value;
  let duration = durationUnit === "frames" ? Math.round(durationValue / 24) : durationValue;

  try {
    generateBtn.classList.add("loading");
    generateBtn.disabled = true;
    statusSection.classList.add("show");
    resultSection.classList.remove("show");

    statusText.textContent = "Preparing reference images...";
    progressFill.style.width = "20%";

    const base64Images = [];
    for (let i = 0; i < uploadedImages.length; i++) {
      const b64 = await fileToBase64(uploadedImages[i].file);
      base64Images.push(b64);
      progressFill.style.width = \`\${20 + ((i + 1) * 30) / uploadedImages.length}%\`;
    }

    statusText.textContent = "Submitting generation request...";
    progressFill.style.width = "60%";

    const payload = {
      prompt,
      reference_image_urls: base64Images,
      aspect_ratio: "16:9",
      duration,
    };

    const submitResult = await makeAPICall(FAL_ENDPOINT, apiKey, payload);
    if (!submitResult.request_id) throw new Error("No request ID returned");

    statusText.textContent = "Processing video...";
    progressFill.style.width = "75%";

    const result = await pollForResult(submitResult.request_id, apiKey);
    if (!result.data?.video?.url) throw new Error("No video URL in result");

    resultVideo.src = result.data.video.url;
    resultSection.classList.add("show");
    progressFill.style.width = "100%";
    statusText.textContent = "Video generated successfully!";

    downloadBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = result.data.video.url;
      a.download = \`vidu-video-\${Date.now()}.mp4\`;
      a.click();
    };

    document.getElementById("videoInfo").innerHTML = \`
      <strong>Video Details:</strong><br>
      Duration: \${duration}s • Resolution: 1080p • Aspect Ratio: 16:9<br>
      Request ID: \${submitResult.request_id}
    \`;

    setTimeout(() => statusSection.classList.remove("show"), 2000);
  } catch (err) {
    console.error(err);
    statusText.innerHTML = \`<div class="error-message">Error: \${err.message}</div>\`;
  } finally {
    generateBtn.classList.remove("loading");
    generateBtn.disabled = false;
    updateGenerateButtonState();
  }
});

updateGenerateButtonState();


window.removeImage = removeImage;
