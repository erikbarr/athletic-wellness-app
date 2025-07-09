// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const transcriptInput = document.getElementById('transcript');
const summarizeBtn = document.getElementById('summarizeBtn');
const btnText = document.querySelector('.btn-text');
const btnLoading = document.querySelector('.btn-loading');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const summaryDiv = document.getElementById('summary');
const modelUsedSpan = document.getElementById('modelUsed');
const errorMessage = document.getElementById('errorMessage');
const copyBtn = document.getElementById('copyBtn');

// Load saved API key
const savedApiKey = localStorage.getItem('claudeApiKey');
if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
}

// Enable/disable button based on inputs
function updateButtonState() {
    const hasApiKey = apiKeyInput.value.trim().length > 0;
    const hasTranscript = transcriptInput.value.trim().length > 0;
    summarizeBtn.disabled = !hasApiKey || !hasTranscript;
}

// Event listeners for input validation
apiKeyInput.addEventListener('input', updateButtonState);
transcriptInput.addEventListener('input', updateButtonState);

// Save API key to localStorage
apiKeyInput.addEventListener('change', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
        localStorage.setItem('claudeApiKey', apiKey);
    } else {
        localStorage.removeItem('claudeApiKey');
    }
});

// Hide sections
function hideResults() {
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
}

// Show loading state
function showLoading() {
    btnText.style.display = 'none';
    btnLoading.style.display = 'flex';
    summarizeBtn.disabled = true;
}

// Hide loading state
function hideLoading() {
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    updateButtonState();
}

// Show error
function showError(message) {
    hideResults();
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Show success
function showSuccess(summary, modelUsed) {
    hideResults();
    summaryDiv.textContent = summary;
    modelUsedSpan.textContent = modelUsed;
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Main summarize function
async function summarizeTranscript() {
    const apiKey = apiKeyInput.value.trim();
    const transcript = transcriptInput.value.trim();

    if (!apiKey || !transcript) {
        showError('Please provide both API key and transcript.');
        return;
    }

    if (!apiKey.startsWith('sk-ant-')) {
        showError('Invalid API key format. Claude API keys start with "sk-ant-"');
        return;
    }

    showLoading();
    hideResults();

    try {
        // Use the existing API endpoint
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                transcript: transcript,
                apiKey: apiKey
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        showSuccess(data.summary, data.modelUsed);

    } catch (error) {
        console.error('Summarization error:', error);
        
        let errorMsg = error.message;
        
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMsg = 'Network error. Please check your connection and try again.';
        }
        
        showError(errorMsg);
    } finally {
        hideLoading();
    }
}

// Copy to clipboard
async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(summaryDiv.textContent);
        
        // Visual feedback
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ Copied!';
        copyBtn.style.background = '#10b981';
        copyBtn.style.color = 'white';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '';
            copyBtn.style.color = '';
        }, 2000);
        
    } catch (err) {
        console.error('Failed to copy:', err);
        
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = summaryDiv.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => {
            copyBtn.textContent = '📋 Copy Summary';
        }, 2000);
    }
}

// Event listeners
summarizeBtn.addEventListener('click', summarizeTranscript);
copyBtn.addEventListener('click', copyToClipboard);

// Allow Enter key in textarea to trigger summarization
transcriptInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (!summarizeBtn.disabled) {
            summarizeTranscript();
        }
    }
});

// Initial button state
updateButtonState();