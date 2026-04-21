const form = document.getElementById("predict-form");
const output = document.getElementById("output");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  output.textContent = "Training models and generating prediction...";

  const formData = new FormData(form);

  try {
    const response = await fetch("/api/predict", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      output.textContent = `Error: ${payload.error || "Unable to generate prediction."}`;
      return;
    }
    output.textContent = JSON.stringify(payload.prediction, null, 2);
  } catch (error) {
    output.textContent = "Error: Network issue while contacting the server.";
  }
});
