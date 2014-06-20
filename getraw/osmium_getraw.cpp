/*

  This is a small tool that reads the contents of the pbf / osm file
  and generate the frequencies and locations for common names for
  specified tags.

  Way locations are represented by the first node.

  Floats (32 bit) are used to represent location.

  The code in this example file is released into the Public Domain.

*/

#include <iostream>
#include <unordered_map>
#include <string>
#include <forward_list>
#include <set>

#include <osmium/io/any_input.hpp>
#include <osmium/io/input_iterator.hpp>
#include <osmium/osm/tag.hpp>
#include <osmium/osm/object.hpp>
#include <osmium/osm/node.hpp>
#include <osmium/osm/way.hpp>
#include <osmium/osm/location.hpp>

using Loc = struct {
    float lat;  //32 bit
    float lng;
};

struct LocType {
    union {
        Loc coord;
        osmium::object_id_type nodeid;  // 64 bit
    } value;
    bool resolved;
};

using LocList = std::forward_list<LocType>;

struct KeyState {
    int count;
    LocList list;
    KeyState(): count{0} {};
};

using FreqMap = std::unordered_map<std::string, KeyState>;

using ResolveMap = std::unordered_map<osmium::object_id_type, Loc>;

void takeTags (osmium::Object *obj);
void addloc (KeyState& state, LocType&& loc);
void addoutstanding (osmium::object_id_type nodeid);
void checkneeded (osmium::Object * obj);
std::string escape (const std::string& str);
void done ();

const std::unordered_map<std::string, std::set<std::string> > osmKeys {
  {"amenity", { "bank",
                "cafe",
                "car_rental",
                "fast_food",
                "fuel",
                "pharmacy",
                "pub",
                "restaurant" }
  } ,
  {"shop", {"alcohol",
            "bakery",
            "books",
            "car_repair",
            "car",
            "chemist",
            "clothes",
            "computer",
            "convenience",
            "department_store",
            "doityourself",
            "electronics",
            "furniture",
            "hairdresser",
            "hardware",
            "hifi",
            "jewelry",
            "mobile_phone",
            "motorcycle",
            "optician",
            "pet",
            "shoes",
            "sports",
            "stationery",
            "supermarket",
            "toys",
            "travel_agency",
            "variety_store",
            "video" }
  }
};

FreqMap counts;
ResolveMap table;
long countway {0};
long counttag {0};
long countnode {0};
long countkey {0};

int threshold = 5;

int main(int argc, char* argv[]) {

    if ((argc < 2) || (argc > 3)) {
        std::cerr << "Usage: " << argv[0] << " OSMFILE [Threshold]\n";
        exit(1);
    }

    if (argc == 3) {
        threshold = std::stoi(argv[2]);
        if (threshold < 1) {
            std::cerr << "Usage: " << argv[0] << " OSMFILE [Threshold]\n";
            std::cerr << "The threshold should be a positive integer\n";
            exit(1);
        }
    }
 

    osmium::io::File infile(argv[1]);

    // First pass
    osmium::io::Reader reader1(infile, osmium::osm_entity::flags::node|
                                       osmium::osm_entity::flags::way);
    osmium::io::InputIterator<osmium::io::Reader, osmium::Object> it(reader1);
    osmium::io::InputIterator<osmium::io::Reader, osmium::Object> end;

    for (; it != end; ++it) {
        if (it->type() == osmium::item_type::node) {
            countnode ++;
            if (it->tags().size() > 0) {
                counttag++;
                takeTags(&(*it));
            }
        } else if (it->type() == osmium::item_type::way) {
            countway ++;
            takeTags(&(*it));
        }
    }
    reader1.close();

    // Second pass
    osmium::io::Reader reader2(infile, osmium::osm_entity::flags::node);
    osmium::io::InputIterator<osmium::io::Reader, osmium::Object> it2(reader2);
    for (; it2 != end; ++it2) {
        checkneeded(&(*it2));
    }
    reader2.close();

    done();

    google::protobuf::ShutdownProtobufLibrary();
}

// First pass

void takeTags (osmium::Object * obj) {
    const osmium::item_type objtype = obj->type();
    const char * name;
    const osmium::TagList& taglist = obj->tags();

    if ((name = taglist.get_value_by_key("name")) != nullptr)  {
         for (const auto& tag: taglist) {
             auto it = osmKeys.find(tag.key());
             if ((it != osmKeys.end()) && (it->second.find(tag.value()) != it->second.end()) ) {           
                LocType loc;

                // prepare the key (fullname)
                const std::string fullname = std::string(tag.key()) + "/" + tag.value() + "|" + name;

                // prepare the loc element for the key
                if (objtype == osmium::item_type::node) {
                    // save coord for nodes
                    loc.value.coord.lat = (static_cast<osmium::Node*>(obj))->lat();
                    loc.value.coord.lng = (static_cast<osmium::Node*>(obj))->lon();
                    loc.resolved = true;
                } else if (objtype == osmium::item_type::way) {
                    osmium::WayNodeList& list = (static_cast<osmium::Way*>(obj))->nodes();
                    if (list.size() > 0) {
                        // first node id for way
                        addoutstanding (loc.value.nodeid = list[0].ref());
                        loc.resolved = false;
                    }
                }
                auto res = counts.emplace (std::move(fullname), KeyState());
                // if fullname already available, increase the count.
                addloc(res.first->second, std::move(loc));
                countkey ++;
             }
         }
    }
}

void addloc (KeyState& state, LocType&& loc)
{
    state.count ++;
    state.list.push_front(loc);
}

// For getting locations of specified nodes during the second pass

void addoutstanding (osmium::object_id_type nodeid)
{
    table[nodeid] = Loc();  // to be resolved in the 2nd pass
}

void checkneeded (osmium::Object * obj)
{
    // save coord for node in map if found
    auto it = table.find (obj->id());
    if (it != table.end()) {
        it->second.lat = (static_cast<osmium::Node*>(obj))->lat();
        it->second.lng = (static_cast<osmium::Node*>(obj))->lon();
    }
}

// Output functions

std::string escape (const std::string& str) {
    std::string out;

    // escape for json name output

    for (auto c : str) {
        switch (c) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            default: out += c; break;
        }
    }
    return out;
}

void done () {
    int cnt5, cnt10, cnt20, cnt30, cnt40, cnt50;
    int cnt5k, cnt10k, cnt20k, cnt30k, cnt40k, cnt50k;

    std::cout << "{\n";

    cnt5 = cnt10 = cnt20 = cnt30 = cnt40 = cnt50 = 0;
    cnt5k = cnt10k = cnt20k = cnt30k = cnt40k = cnt50k = 0;
    bool firstline = true;
    for (const auto& item : counts) {        
        int count = item.second.count;
        if (count >= threshold) {
            if (!firstline) std::cout << ",\n"; else firstline = false;
            std::cout << "  \"" << escape(item.first) << "\": {\n" 
                      << "    \"count\": " << count << ", \n"
                      << "    \"loc\": [\n";
            bool firstloc = true;
            for (const auto& loc1: item.second.list) {

                 const LocType& loc = loc1;
                 float lat, lng;
                 if (!firstloc) std::cout << ",\n"; else firstloc = false;
                 if (loc.resolved) {
                     lat = loc.value.coord.lat; 
                     lng = loc.value.coord.lng; 
                 } else {
                     const Loc& coord = table[loc.value.nodeid];
                     lat = coord.lat;
                     lng = coord.lng;
                 }
                 std::cout << "      {\"lat\": " << lat << ",\n"
                           << "       \"lng\": " << lng << "}";
            }
            std::cout << "\n    ]\n  }";
        }
        if (count >= 5) {
            cnt5 ++;
            cnt5k += count; 
            if (count >= 10) {
                cnt10 ++;
                cnt10k += count; 
                if (count >= 20) {
                    cnt20 ++;
                    cnt20k += count; 
                    if (count >= 30) {
                        cnt30 ++;
                        cnt30k += count; 
                        if (count >= 40) {
                            cnt40 ++;
                            cnt40k += count; 
                            if (count >= 50) {
                                cnt50 ++;
                                cnt50k += count; 
                            }
                        }
                    }
                }
            }
        }
    }
    std::cout << "\n}\n";

    std::cerr << "Process completed. \n"
              << "// Node count: " << countnode << "\n"
              << "// Node w/tag count: " << counttag << "\n"
              << "// Way count: " << countway << "\n"
              << "// # of tag/names counted: " << countkey << "\n"
              << "// # of unique tag/names: " << counts.size() << "\n";

    std::cerr << "// # Stats [counts] / [unique tag/name] / [total tag/name]\n"
              << "// >= 50 " << cnt50 << " " << cnt50k <<"\n"
              << "// >= 40 " << cnt40 << " " << cnt40k <<"\n"
              << "// >= 30 " << cnt30 << " " << cnt30k <<"\n"
              << "// >= 20 " << cnt20 << " " << cnt20k <<"\n"
              << "// >= 10 " << cnt10 << " " << cnt10k <<"\n"
              << "// >= 5 " << cnt5 << " " << cnt5k <<"\n";
}
