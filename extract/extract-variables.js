return (async function() {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  var results = [];

  for (var c = 0; c < collections.length; c++) {
    var collection = collections[c];
    var modeNames = collection.modes.map(function(m) { return m.name; });

    for (var v = 0; v < collection.variableIds.length; v++) {
      var variable = await figma.variables.getVariableByIdAsync(collection.variableIds[v]);
      if (!variable) continue;

      var values = {};
      for (var m = 0; m < collection.modes.length; m++) {
        var mode = collection.modes[m];
        var val = variable.valuesByMode[mode.modeId];
        if (val && val.type === "VARIABLE_ALIAS") {
          values[mode.name] = { alias: val.id };
        } else {
          values[mode.name] = val;
        }
      }

      results.push({
        name: variable.name,
        key: variable.key,
        id: variable.id,
        type: variable.resolvedType,
        collection: collection.name,
        modes: modeNames,
        values: values
      });
    }
  }

  return {
    count: results.length,
    extractedAt: new Date().toISOString(),
    variables: results
  };
})();
