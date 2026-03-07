return (async function() {
  var styles = await figma.getLocalTextStylesAsync();
  var results = [];

  for (var i = 0; i < styles.length; i++) {
    var s = styles[i];
    results.push({
      name: s.name,
      key: s.key,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize,
      fontWeight: s.fontName.style === "Bold" ? 700
        : s.fontName.style === "Semi Bold" ? 600
        : s.fontName.style === "Medium" ? 500
        : 400,
      lineHeight: s.lineHeight.unit === "AUTO" ? "auto"
        : s.lineHeight.unit === "PIXELS" ? s.lineHeight.value
        : s.lineHeight.value + "%",
      letterSpacing: s.letterSpacing.value || 0
    });
  }

  return {
    count: results.length,
    extractedAt: new Date().toISOString(),
    textStyles: results
  };
})();
