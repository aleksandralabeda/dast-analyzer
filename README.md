# DAST Analyzer

I built this application to keep conversations with several language models in one place while testing Android applications. It was the model-querying interface for the experiments described in:

**Aleksandra Łabęda and Mariusz Sepczuk, “LLM-Guided Dynamic Security Testing of Android Applications: A Comparative Study Across Selected Models.”** *Electronics*, 2026, 15(10), 2106.

[https://doi.org/10.3390/electronics15102106](https://doi.org/10.3390/electronics15102106)

The application sends prompts to the models, keeps their conversation histories, and exports responses for later analysis. Android testing, collection of runtime evidence, and weighted assessment of the responses were carried out separately.

## Running the application locally

If you would like to run the application yourself, follow the steps below. You will need Node.js 22.12 or later, npm, and your own API keys for the configured providers.

Open a terminal in the directory containing `package.json` and install the dependencies:

```
npm ci
```

Create a `.env` file in the same directory and replace the placeholders below with your own API keys. The current integrations use three keys:

- `VITE_CEREBRAS_API_KEY` for Llama, Qwen and GPT-oss through Cerebras.
- `VITE_GEMINI_API_KEY` for Gemini through the Google Gemini API.
- `VITE_OPENROUTER_API_KEY` for Trinity through OpenRouter.

The example also includes `VITE_GROQ_API_KEY`, which was present in the older local configuration. The current application does not read this variable or send requests to Groq, so it can be left empty or omitted.

```
VITE_CEREBRAS_API_KEY=your_cerebras_key
VITE_GEMINI_API_KEY=your_gemini_key
VITE_OPENROUTER_API_KEY=your_openrouter_key

# Optional legacy variable; unused by the current application
VITE_GROQ_API_KEY=
```

Then start the development server:

```
npm run dev
```

Open the localhost address printed in the terminal. Restart the server after changing `.env`.

Requests go directly from the browser to the providers. API keys stored in `VITE_*` variables are available to frontend code and are included in production builds. Run the application locally with your own keys. Do not commit `.env` or publish a build containing real credentials. A public deployment would require moving the provider requests and credentials to a backend.

To check the source and generate a production build:

```
npm run lint
npm run build
```

## Using the interface

Set the system prompt and temperature in **Settings**, then enter the initial prompt and run the analysis. You can continue each conversation separately or send a follow-up to selected models together. Cerebras requests are sent sequentially with a short delay; the OpenRouter and Gemini requests are then sent concurrently.

Model panels can be reordered and collapsed. Collapsed panels appear at the end of the list as compact, full-width rows.

**Compare** provides basic text statistics and a side-by-side view of selected responses. These are interface aids, not the weighted evaluation used in the article.

Sessions are saved in the browser's local storage. Use **Export JSON** to keep a copy outside the browser; clearing site data also clears the saved sessions.

## Models and configuration

The table below records the models and API identifiers used in the article, as listed in Section 4.1.2. These identifiers are configured in `src/App.jsx`. They describe the experimental configuration and should not be treated as a list of models currently available from each provider.

| Model | API provider | Identifier |
| --- | --- | --- |
| Gemini 2.5 Flash | Google Gemini API | `gemini-2.5-flash` |
| GPT-oss 120B | Cerebras | `gpt-oss-120b` |
| Llama 3.3 70B | Cerebras | `llama-3.3-70b` |
| Qwen 3 32B | Cerebras | `qwen-3-32b` |
| Trinity Large Preview | OpenRouter | `arcee-ai/trinity-large-preview:free` |

Temperature defaults to **0.7**, as in the experiments. The configured output-token limits are **15,000** for the Cerebras models, **6,000** for Trinity, and **50,000** for Gemini. Other generation parameters use the provider defaults. These request settings may need to change when using a different model or provider configuration.

For the study's RQ1/RQ2 and RQ3 system prompts and application-specific prompts, see **Appendix A** of the article. The default prompt in Settings is a general assistant prompt; replace it with the one for the experiment you want to run.

## About this version

This version includes changes to the interface and frontend dependencies made after the experiments.

The configured models reflect the study. Some model versions or provider configurations may have since been renamed, deprecated, restricted to particular accounts, or removed. The article already notes that the original Llama and Qwen serving configurations were unavailable for the repeated experiments.

If you plan to use the application for your own experiments, first check the current model catalogue and API documentation of each provider. Adapt the application to the models actually available through the APIs you intend to use. A valid API key alone does not guarantee access to a particular model: account permissions, quotas and request limits also apply. Availability of a free endpoint is not guaranteed.

For a replacement model using an existing provider integration, update the following locations in `src/App.jsx`:

- The display name in `MODELS`.
- The API identifier in the relevant `modelMap` for Cerebras or OpenRouter. The Gemini identifier is part of the request URL in the Gemini branch of `queryModel`.
- Generation settings, including the output-token limit and temperature, where required by the replacement model.

Changing a display name does not change the model queried by the application. Adding a different provider also requires implementing its authentication, request format, and response handling. Adding another key to `.env` alone does not enable a new provider.

Start a new analysis after changing models so an existing conversation is not continued with a different model. Record the exact model identifiers, providers and generation settings used in any new evaluation. Results obtained with replacement models or different provider configurations are not a reproduction of the published configuration.

The application does not automatically select a replacement when a configured model is unavailable.
