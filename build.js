var fs = require('fs'),
    filter = require('./filter.json'),
    raw = require('./topNames.json'),
    canon = require('./canonical.json'),
    codegrid = require('codegrid-js');

var out = {},
    defined = {};

var grid = codegrid.CodeGrid();

var rawpos = 0,
    rawkeys = Object.keys(raw);
    rawlen = rawkeys.length;
    rawdone = 0;
    rawtotal = rawlen;

correctNames = buildReverseIndex(canon);

function handlenames() {
    if (rawpos < rawlen) {
        filterValues(rawkeys[rawpos]);
        rawpos++;
    }
    if (rawpos < rawlen) setImmediate(handlenames);
}

function buildReverseIndex(canon) {
    var rIndex = {};
    for (var can in canon) {
        if (canon[can].matches) {
            for (var i = canon[can].matches.length - 1; i >= 0; i--) {
                var match = canon[can].matches[i];
                rIndex[match] = can;
            }
        }
    }
    return rIndex;
}

function filterValues(fullName) {
    var theName = fullName.split('|', 2),
        tag = theName[0].split('/', 2),
        key = tag[0],
        value = tag[1];
    theName = theName[1];
    if (filter.discardedNames.indexOf(theName) == -1) {
        if (correctNames[theName]) theName = correctNames[theName];
        getCodes (raw[fullName].loc, function (err, res){
            if (!err) {
               set(key, value, theName, res);
               rawdone ++;
               if (rawdone == rawtotal) done();
            }
        });
    } else {
        rawtotal--;
        if (rawdone == rawtotal) done();
    }
}

function getCodes (locarray, cb)  {
       var code;
       var locmap = {};
       var completed = 0;
       var len = locarray.length;

       codehandle = function (err, code) {
           if (code && (code !== "None")) {
               if (typeof locmap[code] !== "undefined") {
                   locmap[code] ++;
               } else {
                   locmap[code] = 1;
               }
           }
           completed++;
           if (completed === len) {
               cb (null, locmap);
           }
       };

       for (var i=0; i<len; i++) {
           grid.getCode (locarray[i].lat, locarray[i].lng, codehandle);
       }
}

function set(k, v, name, locmap) {
    for (var c in locmap) {
        setc(c, k, v, name, locmap[c]);
    }
}

function setc(c, k, v, name, count) {
    if (!out[c]) out[c] = {};
    if (!out[c][k]) out[c][k] = {};
    if (!out[c][k][v]) out[c][k][v] = {};
    if (!out[c][k][v][name]) {
        if (canon[name] && canon[name].nix_value) {
            for (var i = 0; i < canon[name].nix_value.length; i++) {
                if (canon[name].nix_value[i] == v) return;
            }
        }

        if (defined[c] && defined[c][name]) {
            var string = name + ' (' + c + ')';
            for (var i = 0; i < defined[c][name].length; i++) {
                string += '\n\t in ' + defined[c][name][i] + ' - ';
                var kv = defined[c][name][i].split('/');
                string += out[c][kv[0]][kv[1]][name].count + ' times';
            }
            console.log(string + '\n\t and ' + k + '/' + v + ' - ' + count + ' times');
        }

        out[c][k][v][name] = {count:  count};
        if (defined[c] && defined[c][name]) {
            defined[c][name].push(k + '/' + v);
        } else if (defined[c]){
            defined[c][name] = [k + '/' + v];
        } else {
            defined[c] = {};
            defined[c][name] = [k + '/' + v];
        }
    } else {
        out[c][k][v][name].count += count;
    }

    if (canon[name]) {
        for (var tag in canon[name].tags) {
            if (!out[c][k][v][name].tags) out[c][k][v][name].tags = {};
            out[c][k][v][name].tags[tag] = canon[name].tags[tag];
        }
    }
}

function done () {
    fs.writeFileSync('name-suggestions.json', JSON.stringify(out, null, 4));
    fs.writeFileSync('name-suggestions.min.json', JSON.stringify(out));
}

handlenames();

