(() => {
    const installButton = document.getElementById("installAppButton");
    let deferredInstallPrompt = null;

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("/service-worker.js").catch((error) => {
                console.warn("Service worker registration failed", error);
            });
        });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        if (installButton) {
            installButton.hidden = false;
        }
    });

    installButton?.addEventListener("click", async () => {
        if (!deferredInstallPrompt) {
            installButton.hidden = true;
            return;
        }

        installButton.disabled = true;
        installButton.textContent = "Opening installer...";

        try {
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
        } catch (error) {
            console.warn("PWA installation prompt failed", error);
        } finally {
            deferredInstallPrompt = null;
            installButton.disabled = false;
            installButton.textContent = "Install VisionAssist 3.0";
            installButton.hidden = true;
        }
    });

    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        if (installButton) installButton.hidden = true;
    });
})();
