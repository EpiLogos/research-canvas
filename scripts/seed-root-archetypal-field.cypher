CREATE CONSTRAINT theory_node_id IF NOT EXISTS
FOR (n:TheoryNode) REQUIRE n.graph_node_id IS UNIQUE;

CREATE INDEX theory_node_is_temporal IF NOT EXISTS
FOR (n:TheoryNode) ON (n.is_temporal);

UNWIND [
  {coordinate:"#0", title:"QL #0"},
  {coordinate:"#1", title:"QL #1"},
  {coordinate:"#2", title:"QL #2"},
  {coordinate:"#3", title:"QL #3"},
  {coordinate:"#4", title:"QL #4"},
  {coordinate:"#5", title:"QL #5"}
] AS row
MERGE (n:Operator {coordinate: row.coordinate})
SET n:PsychoidOperator,
    n.graph_node_id = coalesce(n.graph_node_id, "operator:" + row.coordinate),
    n.title = row.title,
    n.operator_kind = "psychoid",
    n.position = row.coordinate,
    n.source_coordinates = [row.coordinate],
    n.is_temporal = false,
    n.created_at = coalesce(n.created_at, datetime()),
    n.updated_at = datetime();

UNWIND [
  {id:"root-archetypal-field:archetype-as-such", title:"Archetype-as-such", summary:"Irrepresentable generative pattern; empty hub or strange attractor.", coord:null},
  {id:"root-archetypal-field:living-symbol", title:"Living Symbol", summary:"Open intersection where meanings gather, dissolve, and recombine.", coord:null},
  {id:"root-archetypal-field:sun-self-source", title:"Sun / Self / Source", summary:"Radiant source that gives without loss.", coord:null},
  {id:"root-archetypal-field:black-sun-monopoly", title:"Black Sun / Monopoly", summary:"Collapsed center where the one devours the many.", coord:null},
  {id:"root-archetypal-field:father", title:"Father", summary:"Formless identity principle.", coord:null},
  {id:"root-archetypal-field:mother-chora", title:"Mother / Chora", summary:"Matter, evolving love, and generative container.", coord:null},
  {id:"root-archetypal-field:christ-son", title:"Christ / Son", summary:"Received identity and offered self.", coord:null},
  {id:"root-archetypal-field:devil-dark-son", title:"Devil / Dark Son", summary:"Lost child, fabricated father-costume, and false patriarch.", coord:null},
  {id:"root-archetypal-field:humanity", title:"Humanity", summary:"Divine substance exceeding merely rational Man.", coord:null},
  {id:"root-archetypal-field:son-of-man", title:"Son of Man", summary:"Integrated personhood; Man delivered into Humanity.", coord:"#5"},
  {id:"root-archetypal-field:devil", title:"Devil", summary:"Sixfold image at QL #0.", coord:"#0"},
  {id:"root-archetypal-field:mithra", title:"Mithra", summary:"Solar-bull covenant image at QL #1.", coord:"#1"},
  {id:"root-archetypal-field:prometheus", title:"Prometheus", summary:"Stolen fire and technical mediation at QL #2.", coord:"#2"},
  {id:"root-archetypal-field:lucifer-venus", title:"Lucifer / Venus", summary:"Light-bearer, beauty, and reflective seduction at QL #3.", coord:"#3"},
  {id:"root-archetypal-field:satan-chronos", title:"Satan / Chronos", summary:"Accuser-time and devouring age at QL #4.", coord:"#4"},
  {id:"root-archetypal-field:pan-hen", title:"Pan-Hen", summary:"All-one field and animal-divine threshold at QL #5.", coord:"#5"},
  {id:"root-archetypal-field:magician-con-man", title:"Magician / Con-man", summary:"Manipulation of attention, promise, and counterfeit wonder.", coord:null},
  {id:"root-archetypal-field:chemist-doctor", title:"Chemist / Doctor", summary:"Technical cure shadowed by experimental control.", coord:null},
  {id:"root-archetypal-field:showman-actor", title:"Showman / Actor", summary:"Spectacle as identity production.", coord:null},
  {id:"root-archetypal-field:record-keeper", title:"Record Keeper", summary:"Archive, ledger, file, and hidden memory.", coord:null},
  {id:"root-archetypal-field:frankenstein-failed-experiment", title:"Frankenstein / Failed Experiment", summary:"Fabricated life returning as unmanaged consequence.", coord:null},
  {id:"root-archetypal-field:lamb-sheep", title:"Lamb / Sheep", summary:"Sacrificial innocence and herd-passivity polarity.", coord:"#0"},
  {id:"root-archetypal-field:bull-ox", title:"Bull / Ox", summary:"Solar force and laboring capture.", coord:"#1"},
  {id:"root-archetypal-field:dog-sheepdog-wolf", title:"Dog-Sheepdog / Wolf", summary:"Guardian, manager, predator, and pack intelligence.", coord:"#2"},
  {id:"root-archetypal-field:eagle-owl", title:"Eagle / Owl", summary:"Imperial vision and nocturnal occult sight.", coord:"#3"},
  {id:"root-archetypal-field:lion-jaguar-puma", title:"Lion / Jaguar-Puma", summary:"Royal force, jungle sovereignty, and predatory charisma.", coord:"#4"},
  {id:"root-archetypal-field:son-of-man-man-the-son", title:"Son of Man / Man the Son", summary:"Human image folded through divine sonship.", coord:"#5"}
] AS row
MERGE (n:TheoryNode:Archetype {graph_node_id: row.id})
SET n.title = row.title,
    n.summary = row.summary,
    n.body = row.title + "\nRole: " + row.summary + "\n\nGraph use: trans-temporal image node. Read through resonance edges, QL coordinate, and historical instantiations rather than as a dated event.",
    n.archetypal_resonance = row.summary,
    n.coordinate = row.coord,
    n.source_coordinates = CASE WHEN row.coord IS NULL THEN ["antichrist-vault/episodes/episode-1-2-archetypal-resonance.md"] ELSE [row.coord, "antichrist-vault/episodes/episode-1-2-archetypal-resonance.md"] END,
    n.evidence_tags = ["interpretive_vector"],
    n.source_kind = null,
    n.is_temporal = false,
    n.valid_from = null,
    n.valid_to = null,
    n.temporal_precision = null,
    n.created_at = coalesce(n.created_at, datetime()),
    n.updated_at = datetime();

UNWIND [
  {id:"root-archetypal-field:devil-sixfold-lineage", title:"Devil Sixfold Spectral Lineage", summary:"Bounded QL unit for the sixfold Devil-image lineage.", coords:["#0","#1","#2","#3","#4","#5"]},
  {id:"root-archetypal-field:dual-animal-quaternity", title:"Dual Animal Quaternity", summary:"Solar and lunar animal faces arranged across the six QL positions.", coords:["#0","#1","#2","#3","#4","#5"]},
  {id:"root-archetypal-field:conceptual-operations-quaternity", title:"Conceptual Operations Quaternity", summary:"Advertising, hypnosis, spectacle, and power as operational faces of the field.", coords:["#1","#2","#3","#4"]},
  {id:"root-archetypal-field:advertising-propaganda", title:"Advertising / Propaganda", summary:"Mass persuasion as desire-shaping operation.", coords:["#1","antichrist-vault/episodes/episode-1-2-archetypal-resonance.md"]},
  {id:"root-archetypal-field:mind-control-hypnosis", title:"Mind Control / Hypnosis", summary:"Trance, conditioning, and experimental control.", coords:["#2","antichrist-vault/episodes/episode-1-2-archetypal-resonance.md","antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/episode-2-research-timeline.md"]},
  {id:"root-archetypal-field:spectacle-illusion", title:"Spectacle / Illusion", summary:"Image-world as governance of perception.", coords:["#3","antichrist-vault/episodes/episode-1-2-archetypal-resonance.md"]},
  {id:"root-archetypal-field:power-magic", title:"Power / Magic", summary:"Will, charisma, and operative force.", coords:["#4","antichrist-vault/episodes/episode-1-2-archetypal-resonance.md"]}
] AS row
MERGE (n:TheoryNode:Dynamic {graph_node_id: row.id})
SET n.title = row.title,
    n.summary = row.summary,
    n.body = row.title + "\nRole: " + row.summary + "\n\nGraph use: operational field node. Historical forms should link here with INSTANTIATES or ECHOES when the operation becomes socially operative.",
    n.archetypal_resonance = row.summary,
    n.coordinate = null,
    n.source_coordinates = row.coords,
    n.evidence_tags = ["interpretive_vector"],
    n.source_kind = null,
    n.is_temporal = false,
    n.valid_from = null,
    n.valid_to = null,
    n.temporal_precision = null,
    n.created_at = coalesce(n.created_at, datetime()),
    n.updated_at = datetime();

UNWIND [
  {id:"root-archetypal-field:medici-template", title:"Medici Template", summary:"Renaissance template for banking, patronage, image, and power.", from:"1460-01-01", to:"1600-12-31", precision:"year", tags:["documented"]},
  {id:"root-archetypal-field:voc-eic-corpora", title:"VOC / EIC Corpora", summary:"Chartered corporate sovereignty and extraction.", from:"1602-01-01", to:null, precision:"year", tags:["documented"]},
  {id:"root-archetypal-field:banda-genocide", title:"Banda Genocide", summary:"Colonial violence as monopoly enforcement.", from:"1621-01-01", to:null, precision:"year", tags:["documented"]},
  {id:"root-archetypal-field:enlightenment-occultation", title:"Enlightenment Occultation", summary:"Interpretive vector from rational light to hidden administrative power.", from:"1648-01-01", to:"1806-12-31", precision:"year", tags:["interpretive_vector"]},
  {id:"root-archetypal-field:rhodes-round-table-city", title:"Rhodes / Round Table / City", summary:"Imperial network form around Rhodes, Round Table, and City finance.", from:"1877-01-30", to:null, precision:"day", tags:["documented"]},
  {id:"root-archetypal-field:nazi-oss-cia-continuum", title:"Nazi-OSS-CIA Continuum", summary:"Postwar transfer and intelligence continuity as a research vector.", from:"1945-01-01", to:"1973-12-31", precision:"year", tags:["well_evidenced_inference"]},
  {id:"root-archetypal-field:mk-ultra-midnight-climax", title:"MK-ULTRA / Midnight Climax", summary:"Documented mind-control research and sexual blackmail experiment complex.", from:"1953-01-01", to:"1973-12-31", precision:"year", tags:["documented"]},
  {id:"root-archetypal-field:epstein-construct", title:"Epstein Construct", summary:"Documented trafficking/blackmail network as late-stage historical form.", from:"1990-01-01", to:"2019-12-31", precision:"decade", tags:["documented"]},
  {id:"root-archetypal-field:nygard-complement", title:"Nygard Complement", summary:"Parallel predation and patronage pattern around Nygard material.", from:"2020-01-01", to:"2025-12-31", precision:"year", tags:["documented"]}
] AS row
MERGE (n:TheoryNode:Event {graph_node_id: row.id})
SET n.title = row.title,
    n.summary = row.summary,
    n.body = row.title + "\nTimeline: " + row.from + coalesce(" to " + row.to, "") + " (" + row.precision + ").\nRole: " + row.summary + "\n\nGraph use: dated historical form. Its meaning comes from INSTANTIATES/ECHOES links to animal, image, and operation nodes.",
    n.archetypal_resonance = row.summary,
    n.coordinate = null,
    n.source_coordinates = ["antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/episode-2-research-timeline.md"],
    n.evidence_tags = row.tags,
    n.source_kind = null,
    n.is_temporal = true,
    n.valid_from = row.from,
    n.valid_to = row.to,
    n.temporal_precision = row.precision,
    n.created_at = coalesce(n.created_at, datetime()),
    n.updated_at = datetime();

UNWIND [
  {id:"root-archetypal-field:claim-society-of-elect-quigley-1891", title:"Society of the Elect constituted per Quigley", summary:"Contested claim preserved as provenance rather than factual graph edge.", from:"1891-01-01", precision:"year", tags:["contested"]},
  {id:"root-archetypal-field:claim-olson-death-contested-causality", title:"Frank Olson death causality remains contested", summary:"Contested causality claim preserved as a claim source.", from:"1953-01-01", precision:"year", tags:["contested"]},
  {id:"root-archetypal-field:claim-franklin-abuse-network", title:"Franklin abuse network allegations", summary:"Contested allegations preserved as claim provenance.", from:"1988-01-01", precision:"year", tags:["contested"]},
  {id:"root-archetypal-field:claim-caradori-suspicious-death", title:"Gary Caradori death suspicious timing", summary:"Suspicious-timing claim preserved without factual flattening.", from:"1990-01-01", precision:"year", tags:["contested"]},
  {id:"root-archetypal-field:claim-epstein-intelligence-role", title:"Epstein intelligence role", summary:"Contested intelligence-role claim preserved as claim provenance.", from:"2019-01-01", precision:"year", tags:["contested"]},
  {id:"root-archetypal-field:claim-lifelog-facebook-direct-link", title:"LifeLog and Facebook direct linkage not established", summary:"Do-not-seed-as-fact claim for the LifeLog/Facebook linkage.", from:"2004-02-04", precision:"day", tags:["do_not_seed_as_fact"]}
] AS row
MERGE (n:TheoryNode:Source {graph_node_id: row.id})
SET n.title = row.title,
    n.summary = row.summary,
    n.body = row.title + "\nTimeline marker: " + row.from + " (" + row.precision + ").\nRole: " + row.summary + "\n\nGraph use: provenance guardrail. Keep contested/alleged material here as a claim node rather than flattening it into a factual relationship.",
    n.archetypal_resonance = row.summary,
    n.coordinate = null,
    n.source_coordinates = ["antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/episode-2-research-timeline.md"],
    n.evidence_tags = row.tags,
    n.source_kind = "claim",
    n.is_temporal = true,
    n.valid_from = row.from,
    n.valid_to = null,
    n.temporal_precision = row.precision,
    n.created_at = coalesce(n.created_at, datetime()),
    n.updated_at = datetime();

MATCH (a {graph_node_id:"root-archetypal-field:archetype-as-such"}), (b {graph_node_id:"root-archetypal-field:living-symbol"}) MERGE (a)-[:RESONATES_WITH {seed_key:"root:archetype-living-symbol"}]->(b);
MATCH (a {graph_node_id:"root-archetypal-field:living-symbol"}), (b {graph_node_id:"root-archetypal-field:sun-self-source"}) MERGE (a)-[:INFLUENCES {seed_key:"root:living-symbol-sun"}]->(b);
MATCH (a {graph_node_id:"root-archetypal-field:black-sun-monopoly"}), (b {graph_node_id:"root-archetypal-field:sun-self-source"}) MERGE (a)-[:OPPOSES {seed_key:"root:black-sun-opposes-sun"}]->(b);
MATCH (a {graph_node_id:"root-archetypal-field:devil-dark-son"}), (b {graph_node_id:"root-archetypal-field:christ-son"}) MERGE (a)-[:OPPOSES {seed_key:"root:devil-opposes-christ"}]->(b);

UNWIND [
  ["devil","devil-sixfold-lineage"],["mithra","devil-sixfold-lineage"],["prometheus","devil-sixfold-lineage"],["lucifer-venus","devil-sixfold-lineage"],["satan-chronos","devil-sixfold-lineage"],["pan-hen","devil-sixfold-lineage"],
  ["advertising-propaganda","bull-ox"],["mind-control-hypnosis","dog-sheepdog-wolf"],["spectacle-illusion","eagle-owl"],["power-magic","lion-jaguar-puma"]
] AS pair
MATCH (a {graph_node_id:"root-archetypal-field:" + pair[0]}), (b {graph_node_id:"root-archetypal-field:" + pair[1]})
MERGE (a)-[r:RESONATES_WITH {seed_key:"root:resonates:" + pair[0] + ":" + pair[1]}]->(b)
SET r.evidence_tags = ["interpretive_vector"];

UNWIND [
  ["medici-template","INSTANTIATES","bull-ox","dominant","documented"],
  ["medici-template","ECHOES","eagle-owl","secondary","documented"],
  ["voc-eic-corpora","INSTANTIATES","bull-ox","dominant","documented"],
  ["banda-genocide","INSTANTIATES","lamb-sheep","dominant","documented"],
  ["enlightenment-occultation","INSTANTIATES","eagle-owl","dominant","interpretive_vector"],
  ["rhodes-round-table-city","INSTANTIATES","eagle-owl","dominant","documented"],
  ["rhodes-round-table-city","ECHOES","lion-jaguar-puma","secondary","documented"],
  ["nazi-oss-cia-continuum","INSTANTIATES","dog-sheepdog-wolf","dominant","well_evidenced_inference"],
  ["mk-ultra-midnight-climax","INSTANTIATES","mind-control-hypnosis","dominant","documented"],
  ["epstein-construct","INSTANTIATES","lion-jaguar-puma","dominant","documented"],
  ["epstein-construct","ECHOES","record-keeper","secondary","documented"],
  ["epstein-construct","ECHOES","chemist-doctor","secondary","documented"],
  ["nygard-complement","INSTANTIATES","frankenstein-failed-experiment","dominant","documented"]
] AS pair
MATCH (a {graph_node_id:"root-archetypal-field:" + pair[0]}), (b {graph_node_id:"root-archetypal-field:" + pair[2]})
CALL apoc.merge.relationship(a, pair[1], {seed_key:"root:" + pair[1] + ":" + pair[0] + ":" + pair[2]}, {}, b) YIELD rel
SET rel.dominance = pair[3],
    rel.evidence_tags = [pair[4]],
    rel.source_coordinates = ["antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/episode-2-research-timeline.md"];

UNWIND [
  ["rhodes-round-table-city","claim-society-of-elect-quigley-1891"],
  ["mk-ultra-midnight-climax","claim-olson-death-contested-causality"],
  ["epstein-construct","claim-epstein-intelligence-role"]
] AS pair
MATCH (a {graph_node_id:"root-archetypal-field:" + pair[0]}), (b {graph_node_id:"root-archetypal-field:" + pair[1]})
MERGE (a)-[r:SOURCED_FROM {seed_key:"root:claim:" + pair[0] + ":" + pair[1]}]->(b)
SET r.evidence_tags = ["contested"];
