window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"], ["$", "$"]],
    displayMath: [["\\[", "\\]"], ["$$", "$$"]],
    processEscapes: true,
    processEnvironments: true,
    packages: {"[+]": ["ams"]}
  },
  options: {
    skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"]
  },
  startup: {
    typeset: false,
    ready: () => {
      MathJax.startup.defaultReady();

      if (typeof window.flushPendingMathTypeset === "function") {
        window.flushPendingMathTypeset();
      } else {
        setTimeout(() => {
          if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
            window.MathJax.typesetPromise([document.body]).catch((error) => {
              console.warn("MathJax initial typeset failed", error);
            });
          }
        }, 0);
      }
    }
  },
  svg: {
    fontCache: "global"
  }
};
