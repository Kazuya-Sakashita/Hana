const googleFontUrls = {
  inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap',
  notoSerifJp:
    'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;700&display=swap',
}

module.exports = {
  [googleFontUrls.inter]: `
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: local("Arial");
}
`,
  [googleFontUrls.notoSerifJp]: `
/* latin */
@font-face {
  font-family: 'Noto Serif JP';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local("Hiragino Mincho ProN"), local("Yu Mincho"), local("serif");
}

/* latin */
@font-face {
  font-family: 'Noto Serif JP';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: local("Hiragino Mincho ProN"), local("Yu Mincho"), local("serif");
}

/* latin */
@font-face {
  font-family: 'Noto Serif JP';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local("Hiragino Mincho ProN"), local("Yu Mincho"), local("serif");
}
`,
}
