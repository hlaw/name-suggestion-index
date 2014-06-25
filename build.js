var fs = require('fs'),
    filter = require('./filter.json'),
    raw = require('./topNames.json'),
    canon = require('./canonical.json'),
    codegrid = require('codegrid-js');

var out = {},
    defined = {};

var grid = codegrid.CodeGrid();

var rawpos = 0,
    rawkeys = Object.keys(raw),
    rawlen = rawkeys.length,
    rawdone = 0,
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
    if (filter.discardedNames.indexOf(theName) === -1) {
        if (correctNames[theName]) theName = correctNames[theName];
        getCodes (raw[fullName].loc, function (err, res){
            if (!err) {
               set(key, value, theName, res);
               rawdone ++;
               if (rawdone === rawtotal) done();
            }
        });
    } else {
        rawtotal--;
        if (rawdone === rawtotal) done();
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
                if (canon[name].nix_value[i] === v) return;
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
            if (tag.slice(0,5) === 'name:') {
                addSearchTerms(name, out[c][k][v][name], canon[name].tags[tag]);
            }
        }
        // For better searching, add name:XX tags and canon matches
        // to the list of terms for searching after sorting out duplicates
        //for (var ctagkey in canon[name].tags) {
        //    if (canon[name].tags.hasOwnProperty(ctagkey) && ctagkey.startsWith('name:')) {
        //        addSearchTerms(out[c][k][v][name].tags, canon[name].tags[ctagkey]);
        //    }
        //}
        for (var i in canon[name].matches) {
            addSearchTerms(name, out[c][k][v][name], canon[name].matches[i]);
        }
    }
}

function addSearchTerms (name, outname, term) {
    var i;
    // if term is redundant in face of name
    if (checkRedundant(name, term)) {
        return;
    }
    if (outname.hasOwnProperty("canon") && outname.canon.length > 0) {
        for (i in outname.canon) {
            // return if term is redundant in face of any of the existing terms
            if (checkRedundant(outname.canon[i], term)) {
                return;
            }
            // use term instead of an existing one 
            // if the term make an existing one redundant, and return
            if (checkRedundant(term, outname.canon[i])) {
                outname.canon[i] = term;
                return;
            }
        }
    } else {
        outname.canon = [];
    }
    outname.canon.push(term);
}

function checkRedundant(term1, term2) {
    // Check if term1 makes term2 redundant for the purpose of suggestion
    // This would depend on the suggestion algorithm in iD.
    lower1 = term1.toLowerCase();
    lower2 = term2.toLowerCase();

    if (lower1 === lower2) return true;
    // check startswith
    if (lower1.slice(0, lower2.length) === lower2) return true;
    // If the first few character is the same some subsequent difference
    // perhaps doesn't matter (filter cases such as YYYYs and YYYY's). The
    // longer one which perhaps give more segmentation for search is retained.
    if ((lower1.substring(0,3) === lower2.substring(0,3)) && ((lower2.length > 4) && (suggestEditDistance (lower2, lower1, 1) < 9999))) {
        return true;
    }
    return false;
}

// EditDistance under util.js of iD

function suggestEditDistance (a, b, t, s) {
    var blen = b.length;
    var alen = a.length;
    if (alen === 0) return 0;
    var symm = false;
    if (typeof s !== 'undefined' && s === true) {
        symm = true;
    }
    if (blen === 0) return symm? 0 : ((alen>t) ? 9999 : alen);
    var matrix = [];
    matrix[0]=[0];
    // No initial insertion and deletion
    for (var i = 1; i <= b.length; i++) { matrix[i] = []; }
    var prevj = 0;  // mark last assigned position of previous row
    var prevfirstj = 0;
    var firstj = 1;  // limit test to diagonal region only
    var nextfirstj = 1;

    for (i = 1; i <= blen; i++) {
        var ins = 1;  // insertion cost
        if (symm && (i === blen)) ins = 0;  // not to count distance after end of b
        var del = 1;  // deletion cost
        var min = 9999;
        for (var j = firstj; j <= alen; j++) {
            var sub = 1;
            if (j === alen) del = 0;
            if (b.charAt(i-1) === a.charAt(j-1)) sub = 0;
            matrix[i][j] = Math.min((((j-1) > prevj) || ((j-1) < prevfirstj))? 9999 : matrix[i-1][j-1] + sub, // match or substitution
                Math.min((j === firstj)? 9999 : matrix[i][j-1] + ins, // insertion
                (j > prevj)? 9999 : matrix[i-1][j] + del)); // deletion
            if ((i > 1) && (j > 1) && (b.charAt(i-1) === a.charAt(j-2)) && (b.charAt(i-2) === a.charAt(j-1))) {
                matrix[i][j] = Math.min(matrix[i][j],
                    (typeof matrix[i-2][j-2] === 'undefined')? 9999 : matrix[i-2][j-2] + 1);  // transposition
            }
            min = Math.min(matrix[i][j], min);  // best of this row
            if ((j === nextfirstj && (j !== alen)) && (matrix[i][j] > t)) {
                nextfirstj++;
            }
            if ((j > prevj) && (matrix[i][j] >= t)) {
                if (i !== blen) {
                    // no need to further loop on j, as it can only be increasing unless i===blen
                    prevj = j;
                    break;
                }
                // bottom row, if not symm and matrix[i][j] already >=t 
                // before reaching end of row, fail
                if ((!symm) && (j<alen)) {
                    return 9999;
                }
            }
            if (j === alen) prevj = j;
        }
        if (min > t) return 9999;
        prevfirstj = firstj;
        if (nextfirstj === alen) {
            // continuing would just carry the value downwards
            return matrix[i][alen];
        }
        if (firstj !== nextfirstj) firstj = nextfirstj+1;
    }
    return matrix[blen][alen];
};


function done () {
    fs.writeFileSync('name-suggestions.json', JSON.stringify(out, null, 4));
    fs.writeFileSync('name-suggestions.min.json', JSON.stringify(out));
}

handlenames();

