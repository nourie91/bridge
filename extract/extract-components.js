return (async function() {
  var results = [];

  // Find all component sets (components with variants)
  var componentSets = figma.currentPage.findAll(function(n) {
    return n.type === "COMPONENT_SET";
  });

  for (var i = 0; i < componentSets.length; i++) {
    var cs = componentSets[i];
    var props = {};

    try {
      var defs = cs.componentPropertyDefinitions || {};
      for (var key in defs) {
        var def = defs[key];
        props[key.split("#")[0]] = {
          type: def.type,
          defaultValue: def.defaultValue,
          variantOptions: def.variantOptions || undefined
        };
      }
    } catch (e) {}

    results.push({
      name: cs.name,
      key: cs.key,
      type: "COMPONENT_SET",
      variantCount: cs.children ? cs.children.length : 0,
      properties: props
    });
  }

  // Find standalone components (not inside a component set)
  var standalones = figma.currentPage.findAll(function(n) {
    return n.type === "COMPONENT" && (!n.parent || n.parent.type !== "COMPONENT_SET");
  });

  for (var j = 0; j < standalones.length; j++) {
    var comp = standalones[j];
    results.push({
      name: comp.name,
      key: comp.key,
      type: "COMPONENT",
      variantCount: 1,
      properties: {}
    });
  }

  return {
    count: results.length,
    extractedAt: new Date().toISOString(),
    components: results
  };
})();
