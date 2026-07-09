PRAGMA foreign_keys = OFF;
BEGIN;

UPDATE canvases
SET id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002',
    created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'root-archetypal-field-canvas';

UPDATE projects
SET id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb001',
    primary_canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002',
    publish_settings = '{"includeResources":true,"mobileSequenceFirst":false,"theme":"nocturne"}',
    created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE slug = 'root-archetypal-field';

UPDATE canvases
SET project_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb001'
WHERE id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002';

UPDATE node_layout
SET canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002'
WHERE canvas_id = 'root-archetypal-field-canvas';

UPDATE edge_layout
SET canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002'
WHERE canvas_id = 'root-archetypal-field-canvas';

UPDATE canvas_app_state
SET canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002'
WHERE canvas_id = 'root-archetypal-field-canvas';

UPDATE canvas_nodes
SET canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002'
WHERE canvas_id = 'root-archetypal-field-canvas';

UPDATE canvas_edges
SET canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002'
WHERE canvas_id = 'root-archetypal-field-canvas';

INSERT INTO projects (
  id, display_name, slug, parent_project_id, root_path, primary_canvas_id,
  summary, cover_asset, publish_settings, created_at, updated_at
) VALUES (
  '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb001',
  'Root Archetypal Field',
  'root-archetypal-field',
  NULL,
  '/Users/admin/Documents/Antichrist Project',
  '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002',
  'A real ontology-backed canvas for QL units, archetypal images, animal quaternity, conceptual operations, historical forms, and claim provenance.',
  NULL,
  '{"includeResources":true,"mobileSequenceFirst":false,"theme":"nocturne"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(slug) DO UPDATE SET
  id = excluded.id,
  display_name = excluded.display_name,
  root_path = excluded.root_path,
  primary_canvas_id = excluded.primary_canvas_id,
  summary = excluded.summary,
  publish_settings = excluded.publish_settings,
  created_at = excluded.created_at,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');

INSERT INTO canvases (
  id, project_id, name, kind, summary, is_primary, created_at, updated_at
) VALUES (
  '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002',
  '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb001',
  'Archetypal Field',
  'primary',
  'Canvas projection of the root archetypal ontology.',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(id) DO UPDATE SET
  project_id = excluded.project_id,
  name = excluded.name,
  summary = excluded.summary,
  is_primary = excluded.is_primary,
  created_at = excluded.created_at,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');

UPDATE projects
SET primary_canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE slug = 'root-archetypal-field';

WITH nodes(graph_node_id, x, y, colour, title, summary, tag) AS (
  VALUES
  ('root-archetypal-field:archetype-as-such',0,0,'#d8b65a','Archetype-as-such','Irrepresentable generative pattern; empty hub or strange attractor.','interpretive_vector'),
  ('root-archetypal-field:living-symbol',320,0,'#d8b65a','Living Symbol','Open intersection where meanings gather, dissolve, and recombine.','interpretive_vector'),
  ('root-archetypal-field:sun-self-source',0,-360,'#d8b65a','Sun / Self / Source','Radiant source that gives without loss.','interpretive_vector'),
  ('root-archetypal-field:black-sun-monopoly',320,-360,'#d8b65a','Black Sun / Monopoly','Collapsed center where the one devours the many.','interpretive_vector'),
  ('root-archetypal-field:father',-760,-220,'#d8b65a','Father','Formless identity principle.','interpretive_vector'),
  ('root-archetypal-field:mother-chora',-460,-220,'#d8b65a','Mother / Chora','Matter, evolving love, and generative container.','interpretive_vector'),
  ('root-archetypal-field:christ-son',-160,-220,'#d8b65a','Christ / Son','Received identity and offered self.','interpretive_vector'),
  ('root-archetypal-field:devil-dark-son',-760,-30,'#d8b65a','Devil / Dark Son','Lost child, fabricated father-costume, and false patriarch.','interpretive_vector'),
  ('root-archetypal-field:humanity',-460,-30,'#d8b65a','Humanity','Divine substance exceeding merely rational Man.','interpretive_vector'),
  ('root-archetypal-field:son-of-man',-160,-30,'#d8b65a','Son of Man','Integrated personhood; Man delivered into Humanity.','interpretive_vector'),
  ('root-archetypal-field:devil',620,-260,'#d8b65a','Devil','Sixfold image at QL #0.','interpretive_vector'),
  ('root-archetypal-field:mithra',920,-260,'#d8b65a','Mithra','Solar-bull covenant image at QL #1.','interpretive_vector'),
  ('root-archetypal-field:prometheus',1220,-260,'#d8b65a','Prometheus','Stolen fire and technical mediation at QL #2.','interpretive_vector'),
  ('root-archetypal-field:lucifer-venus',620,-70,'#d8b65a','Lucifer / Venus','Light-bearer, beauty, and reflective seduction at QL #3.','interpretive_vector'),
  ('root-archetypal-field:satan-chronos',920,-70,'#d8b65a','Satan / Chronos','Accuser-time and devouring age at QL #4.','interpretive_vector'),
  ('root-archetypal-field:pan-hen',1220,-70,'#d8b65a','Pan-Hen','All-one field and animal-divine threshold at QL #5.','interpretive_vector'),
  ('root-archetypal-field:magician-con-man',-120,700,'#d8b65a','Magician / Con-man','Manipulation of attention, promise, and counterfeit wonder.','interpretive_vector'),
  ('root-archetypal-field:chemist-doctor',180,700,'#d8b65a','Chemist / Doctor','Technical cure shadowed by experimental control.','interpretive_vector'),
  ('root-archetypal-field:showman-actor',480,700,'#d8b65a','Showman / Actor','Spectacle as identity production.','interpretive_vector'),
  ('root-archetypal-field:record-keeper',780,700,'#d8b65a','Record Keeper','Archive, ledger, file, and hidden memory.','interpretive_vector'),
  ('root-archetypal-field:frankenstein-failed-experiment',1080,700,'#d8b65a','Frankenstein / Failed Experiment','Fabricated life returning as unmanaged consequence.','interpretive_vector'),
  ('root-archetypal-field:devil-sixfold-lineage',-120,890,'#7db7a5','Devil Sixfold Spectral Lineage','Bounded QL unit for the sixfold Devil-image lineage.','interpretive_vector'),
  ('root-archetypal-field:dual-animal-quaternity',180,890,'#7db7a5','Dual Animal Quaternity','Solar and lunar animal faces arranged across the six QL positions.','interpretive_vector'),
  ('root-archetypal-field:conceptual-operations-quaternity',480,890,'#7db7a5','Conceptual Operations Quaternity','Advertising, hypnosis, spectacle, and power as operational faces of the field.','interpretive_vector'),
  ('root-archetypal-field:lamb-sheep',-820,360,'#d8b65a','Lamb / Sheep','Sacrificial innocence and herd-passivity polarity.','interpretive_vector'),
  ('root-archetypal-field:bull-ox',-520,360,'#d8b65a','Bull / Ox','Solar force and laboring capture.','interpretive_vector'),
  ('root-archetypal-field:dog-sheepdog-wolf',-220,360,'#d8b65a','Dog-Sheepdog / Wolf','Guardian, manager, predator, and pack intelligence.','interpretive_vector'),
  ('root-archetypal-field:eagle-owl',-820,550,'#d8b65a','Eagle / Owl','Imperial vision and nocturnal occult sight.','interpretive_vector'),
  ('root-archetypal-field:lion-jaguar-puma',-520,550,'#d8b65a','Lion / Jaguar-Puma','Royal force, jungle sovereignty, and predatory charisma.','interpretive_vector'),
  ('root-archetypal-field:son-of-man-man-the-son',-220,550,'#d8b65a','Son of Man / Man the Son','Human image folded through divine sonship.','interpretive_vector'),
  ('root-archetypal-field:advertising-propaganda',220,430,'#7db7a5','Advertising / Propaganda','Mass persuasion as desire-shaping operation.','interpretive_vector'),
  ('root-archetypal-field:mind-control-hypnosis',520,430,'#7db7a5','Mind Control / Hypnosis','Trance, conditioning, and experimental control.','interpretive_vector'),
  ('root-archetypal-field:spectacle-illusion',820,430,'#7db7a5','Spectacle / Illusion','Image-world as governance of perception.','interpretive_vector'),
  ('root-archetypal-field:power-magic',1120,430,'#7db7a5','Power / Magic','Will, charisma, and operative force.','interpretive_vector'),
  ('root-archetypal-field:medici-template',980,80,'#c46f5b','Medici Template','Renaissance template for banking, patronage, image, and power.','documented'),
  ('root-archetypal-field:voc-eic-corpora',1280,80,'#c46f5b','VOC / EIC Corpora','Chartered corporate sovereignty and extraction.','documented'),
  ('root-archetypal-field:banda-genocide',1580,80,'#c46f5b','Banda Genocide','Colonial violence as monopoly enforcement.','documented'),
  ('root-archetypal-field:enlightenment-occultation',980,270,'#c46f5b','Enlightenment Occultation','Interpretive vector from rational light to hidden administrative power.','interpretive_vector'),
  ('root-archetypal-field:rhodes-round-table-city',1280,270,'#c46f5b','Rhodes / Round Table / City','Imperial network form around Rhodes, Round Table, and City finance.','documented'),
  ('root-archetypal-field:nazi-oss-cia-continuum',1580,270,'#c46f5b','Nazi-OSS-CIA Continuum','Postwar transfer and intelligence continuity as a research vector.','well_evidenced_inference'),
  ('root-archetypal-field:mk-ultra-midnight-climax',980,460,'#c46f5b','MK-ULTRA / Midnight Climax','Documented mind-control research and sexual blackmail experiment complex.','documented'),
  ('root-archetypal-field:epstein-construct',1280,460,'#c46f5b','Epstein Construct','Documented trafficking/blackmail network as late-stage historical form.','documented'),
  ('root-archetypal-field:nygard-complement',1580,460,'#c46f5b','Nygard Complement','Parallel predation and patronage pattern around Nygard material.','documented'),
  ('root-archetypal-field:claim-society-of-elect-quigley-1891',1040,640,'#9f8fd1','Society of the Elect constituted per Quigley','Contested claim preserved as provenance rather than factual graph edge.','contested'),
  ('root-archetypal-field:claim-olson-death-contested-causality',1340,640,'#9f8fd1','Frank Olson death causality remains contested','Contested causality claim preserved as a claim source.','contested'),
  ('root-archetypal-field:claim-franklin-abuse-network',1640,640,'#9f8fd1','Franklin abuse network allegations','Contested allegations preserved as claim provenance.','contested'),
  ('root-archetypal-field:claim-caradori-suspicious-death',1040,830,'#9f8fd1','Gary Caradori death suspicious timing','Suspicious-timing claim preserved without factual flattening.','contested'),
  ('root-archetypal-field:claim-epstein-intelligence-role',1340,830,'#9f8fd1','Epstein intelligence role','Contested intelligence-role claim preserved as claim provenance.','contested'),
  ('root-archetypal-field:claim-lifelog-facebook-direct-link',1640,830,'#9f8fd1','LifeLog and Facebook direct linkage not established','Do-not-seed-as-fact claim for the LifeLog/Facebook linkage.','do_not_seed_as_fact')
)
INSERT OR REPLACE INTO node_layout (
  graph_node_id, canvas_id, position_x, position_y, width, height, style_json, created_at, updated_at
)
SELECT
  graph_node_id,
  '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002',
  x,
  y,
  180,
  105,
  json_object(
    'dotColour', colour,
    'bgColour', '#151515',
    'textColour', '#f2efe8',
    '__canvasNode', json_object(
      'type', 'note',
      'title', title,
      'content',
        title || char(10) ||
        'Role: ' || summary || char(10) || char(10) ||
        'Links: ' ||
        CASE graph_node_id
          WHEN 'root-archetypal-field:archetype-as-such' THEN 'generates the living-symbol field; read as the empty attractor behind every image.'
          WHEN 'root-archetypal-field:living-symbol' THEN 'mediates Archetype-as-such, Sun/Self, and the symbolic image families.'
          WHEN 'root-archetypal-field:sun-self-source' THEN 'opposed by Black Sun/Monopoly; source-pole for healthy one-and-many relation.'
          WHEN 'root-archetypal-field:black-sun-monopoly' THEN 'inverts Sun/Self; historical echoes include monopoly, extraction, and sacrifice-as-control.'
          WHEN 'root-archetypal-field:father' THEN 'identity principle behind the divine-family drama; inverted by fabricated patriarchal costume.'
          WHEN 'root-archetypal-field:mother-chora' THEN 'generative matter/container; shadowed by body inventory, captive nature, and Frankenstein motifs.'
          WHEN 'root-archetypal-field:christ-son' THEN 'received sonship; opposed by Devil/Dark Son and restored through Son of Man.'
          WHEN 'root-archetypal-field:devil-dark-son' THEN 'lost child/fake father pole; opposes Christ/Son and drives the Antichrist identity drama.'
          WHEN 'root-archetypal-field:humanity' THEN 'larger divine substance that can hold Man, Devil, and Son of Man without collapse.'
          WHEN 'root-archetypal-field:son-of-man' THEN 'QL #5 integration; bridge to Pan-Hen and Son of Man / Man the Son polarity.'
          WHEN 'root-archetypal-field:devil' THEN 'QL #0 in the Devil sixfold lineage; general antagonist attractor.'
          WHEN 'root-archetypal-field:mithra' THEN 'QL #1 solar-bull covenant; sacrifice releases rather than hoards force.'
          WHEN 'root-archetypal-field:prometheus' THEN 'QL #2 stolen fire; wounded gift, techne, and self-sacrifice for humanity.'
          WHEN 'root-archetypal-field:lucifer-venus' THEN 'QL #3 beauty/light split; autonomy, exile, and reflective seduction.'
          WHEN 'root-archetypal-field:satan-chronos' THEN 'QL #4 accuser-time; devouring parent and black-sun extraction.'
          WHEN 'root-archetypal-field:pan-hen' THEN 'QL #5 all-one restoration; animal-divine threshold and feeder returned to field.'
          WHEN 'root-archetypal-field:magician-con-man' THEN 'links propaganda, spectacle, and counterfeit reality-making.'
          WHEN 'root-archetypal-field:chemist-doctor' THEN 'links alchemy, pharmacology, IG Farben/MK-ULTRA, and experimental cure/control.'
          WHEN 'root-archetypal-field:showman-actor' THEN 'links media, performance, public face, and hidden operational backstage.'
          WHEN 'root-archetypal-field:record-keeper' THEN 'links file destruction, classified archives, Epstein records, and institutional memory.'
          WHEN 'root-archetypal-field:frankenstein-failed-experiment' THEN 'instantiated by Nygard Complement; matter assembled without spiritual wholeness.'
          WHEN 'root-archetypal-field:devil-sixfold-lineage' THEN 'contains Devil, Mithra, Prometheus, Lucifer/Venus, Satan/Chronos, and Pan-Hen.'
          WHEN 'root-archetypal-field:dual-animal-quaternity' THEN 'organizes Lamb/Sheep, Bull/Ox, Dog/Wolf, Eagle/Owl, Lion/Jaguar, and Son-of-Man polarity.'
          WHEN 'root-archetypal-field:conceptual-operations-quaternity' THEN 'organizes advertising, hypnosis, spectacle, and power/magic as operational faces.'
          WHEN 'root-archetypal-field:lamb-sheep' THEN 'instantiated by Banda Genocide; victim/herd polarity in sacrifice and mass programming.'
          WHEN 'root-archetypal-field:bull-ox' THEN 'instantiated by Medici and VOC/EIC extraction; force, burden, banking, and commodity power.'
          WHEN 'root-archetypal-field:dog-sheepdog-wolf' THEN 'instantiated by Nazi-OSS-CIA continuity; loyalty, predation, intelligence obedience.'
          WHEN 'root-archetypal-field:eagle-owl' THEN 'instantiated by Enlightenment occultation and Rhodes/Round Table/City; visible vision vs hidden sight.'
          WHEN 'root-archetypal-field:lion-jaguar-puma' THEN 'instantiated by Epstein Construct; open sovereignty shadowed by covert predatory charisma.'
          WHEN 'root-archetypal-field:son-of-man-man-the-son' THEN 'human-divine integration opposed by eternal-adolescent princely substitution.'
          WHEN 'root-archetypal-field:advertising-propaganda' THEN 'resonates with Bull/Ox; Medici patronage, revolutionary branding, consumer desire.'
          WHEN 'root-archetypal-field:mind-control-hypnosis' THEN 'instantiated by MK-ULTRA/Midnight Climax; Dog/Wolf obedience and conditioning.'
          WHEN 'root-archetypal-field:spectacle-illusion' THEN 'resonates with Eagle/Owl; visible governance masking invisible operations.'
          WHEN 'root-archetypal-field:power-magic' THEN 'resonates with Lion/Jaguar; hierarchy sustained by charged names, ritual, reputation.'
          WHEN 'root-archetypal-field:medici-template' THEN 'Timeline 1460-1600; Bull/Ox dominant, Eagle/Owl and Lion/Jaguar secondary.'
          WHEN 'root-archetypal-field:voc-eic-corpora' THEN 'Timeline begins 1602; corporate sovereignty and commodity extraction instantiate Bull/Ox.'
          WHEN 'root-archetypal-field:banda-genocide' THEN 'Timeline 1621; monopoly enforcement instantiates Lamb/Sheep sacrifice.'
          WHEN 'root-archetypal-field:enlightenment-occultation' THEN 'Timeline 1648-1806; Eagle/Owl vector of rational light and hidden inner science.'
          WHEN 'root-archetypal-field:rhodes-round-table-city' THEN 'Timeline begins 1877; Eagle/Owl dominant, Lion/Jaguar secondary, claim-linked to Quigley.'
          WHEN 'root-archetypal-field:nazi-oss-cia-continuum' THEN 'Timeline 1945-1973; Dog/Wolf continuity across intelligence, chemistry, and obedience.'
          WHEN 'root-archetypal-field:mk-ultra-midnight-climax' THEN 'Timeline 1953-1973; documented hypnosis/conditioning complex, linked to Olson claim.'
          WHEN 'root-archetypal-field:epstein-construct' THEN 'Timeline 1990s-2019; Lion/Jaguar dominant with Record Keeper and Chemist echoes.'
          WHEN 'root-archetypal-field:nygard-complement' THEN 'Timeline 2020-2025; Frankenstein/body-inventory complement to Epstein field.'
          WHEN 'root-archetypal-field:claim-society-of-elect-quigley-1891' THEN 'Claim node, not fact edge; use as provenance guardrail for Rhodes network assertion.'
          WHEN 'root-archetypal-field:claim-olson-death-contested-causality' THEN 'Claim node for contested causality around Frank Olson; linked from MK-ULTRA.'
          WHEN 'root-archetypal-field:claim-franklin-abuse-network' THEN 'Claim node for Franklin abuse-network allegations; keep separated from documented fraud.'
          WHEN 'root-archetypal-field:claim-caradori-suspicious-death' THEN 'Claim node for suspicious-timing interpretation around Gary Caradori death.'
          WHEN 'root-archetypal-field:claim-epstein-intelligence-role' THEN 'Claim node for contested intelligence-role interpretation; linked from Epstein Construct.'
          WHEN 'root-archetypal-field:claim-lifelog-facebook-direct-link' THEN 'Guardrail claim: documented coincidence, no direct LifeLog/Facebook link seeded as fact.'
          ELSE 'review source coordinates and graph relationships before using as chronology.'
        END || char(10) || char(10) ||
        'Evidence: ' || tag || '. Source: episode-1-2 resonance ledger / episode-2 timeline ledger.',
      'tags', json_array(tag)
    )
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM nodes;

WITH edges(id, src, tgt, kind, stroke) AS (
  VALUES
  ('root-edge-archetype-living-symbol','root-archetypal-field:archetype-as-such','root-archetypal-field:living-symbol','RESONATES_WITH','#d8b65a'),
  ('root-edge-living-symbol-sun','root-archetypal-field:living-symbol','root-archetypal-field:sun-self-source','INFLUENCES','#d8b65a'),
  ('root-edge-black-sun-opposes-sun','root-archetypal-field:black-sun-monopoly','root-archetypal-field:sun-self-source','OPPOSES','#c46f5b'),
  ('root-edge-devil-opposes-christ','root-archetypal-field:devil-dark-son','root-archetypal-field:christ-son','OPPOSES','#c46f5b'),
  ('root-edge-devil-lineage-devil','root-archetypal-field:devil','root-archetypal-field:devil-sixfold-lineage','RESONATES_WITH','#d8b65a'),
  ('root-edge-devil-lineage-mithra','root-archetypal-field:mithra','root-archetypal-field:devil-sixfold-lineage','RESONATES_WITH','#d8b65a'),
  ('root-edge-devil-lineage-prometheus','root-archetypal-field:prometheus','root-archetypal-field:devil-sixfold-lineage','RESONATES_WITH','#d8b65a'),
  ('root-edge-devil-lineage-lucifer','root-archetypal-field:lucifer-venus','root-archetypal-field:devil-sixfold-lineage','RESONATES_WITH','#d8b65a'),
  ('root-edge-devil-lineage-satan','root-archetypal-field:satan-chronos','root-archetypal-field:devil-sixfold-lineage','RESONATES_WITH','#d8b65a'),
  ('root-edge-devil-lineage-pan-hen','root-archetypal-field:pan-hen','root-archetypal-field:devil-sixfold-lineage','RESONATES_WITH','#d8b65a'),
  ('root-edge-advertising-bull','root-archetypal-field:advertising-propaganda','root-archetypal-field:bull-ox','RESONATES_WITH','#7db7a5'),
  ('root-edge-hypnosis-dog-wolf','root-archetypal-field:mind-control-hypnosis','root-archetypal-field:dog-sheepdog-wolf','RESONATES_WITH','#7db7a5'),
  ('root-edge-spectacle-eagle','root-archetypal-field:spectacle-illusion','root-archetypal-field:eagle-owl','RESONATES_WITH','#7db7a5'),
  ('root-edge-power-lion','root-archetypal-field:power-magic','root-archetypal-field:lion-jaguar-puma','RESONATES_WITH','#7db7a5'),
  ('root-edge-medici-instantiates-bull','root-archetypal-field:medici-template','root-archetypal-field:bull-ox','INSTANTIATES','#7db7a5'),
  ('root-edge-medici-echoes-eagle','root-archetypal-field:medici-template','root-archetypal-field:eagle-owl','ECHOES','#7db7a5'),
  ('root-edge-voc-instantiates-bull','root-archetypal-field:voc-eic-corpora','root-archetypal-field:bull-ox','INSTANTIATES','#7db7a5'),
  ('root-edge-enlightenment-instantiates-eagle','root-archetypal-field:enlightenment-occultation','root-archetypal-field:eagle-owl','INSTANTIATES','#7db7a5'),
  ('root-edge-rhodes-instantiates-eagle','root-archetypal-field:rhodes-round-table-city','root-archetypal-field:eagle-owl','INSTANTIATES','#7db7a5'),
  ('root-edge-rhodes-echoes-lion','root-archetypal-field:rhodes-round-table-city','root-archetypal-field:lion-jaguar-puma','ECHOES','#7db7a5'),
  ('root-edge-nazi-oss-cia-instantiates-dog','root-archetypal-field:nazi-oss-cia-continuum','root-archetypal-field:dog-sheepdog-wolf','INSTANTIATES','#7db7a5'),
  ('root-edge-mk-ultra-instantiates-hypnosis','root-archetypal-field:mk-ultra-midnight-climax','root-archetypal-field:mind-control-hypnosis','INSTANTIATES','#7db7a5'),
  ('root-edge-epstein-instantiates-lion','root-archetypal-field:epstein-construct','root-archetypal-field:lion-jaguar-puma','INSTANTIATES','#7db7a5'),
  ('root-edge-epstein-echoes-record-keeper','root-archetypal-field:epstein-construct','root-archetypal-field:record-keeper','ECHOES','#7db7a5'),
  ('root-edge-epstein-echoes-chemist','root-archetypal-field:epstein-construct','root-archetypal-field:chemist-doctor','ECHOES','#7db7a5'),
  ('root-edge-nygard-instantiates-frankenstein','root-archetypal-field:nygard-complement','root-archetypal-field:frankenstein-failed-experiment','INSTANTIATES','#7db7a5'),
  ('root-edge-banda-instantiates-lamb','root-archetypal-field:banda-genocide','root-archetypal-field:lamb-sheep','INSTANTIATES','#7db7a5'),
  ('root-edge-rhodes-claim','root-archetypal-field:rhodes-round-table-city','root-archetypal-field:claim-society-of-elect-quigley-1891','SOURCED_FROM','#9f8fd1'),
  ('root-edge-mk-ultra-olson-claim','root-archetypal-field:mk-ultra-midnight-climax','root-archetypal-field:claim-olson-death-contested-causality','SOURCED_FROM','#9f8fd1'),
  ('root-edge-epstein-claim','root-archetypal-field:epstein-construct','root-archetypal-field:claim-epstein-intelligence-role','SOURCED_FROM','#9f8fd1')
)
INSERT OR REPLACE INTO edge_layout (
  id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
  source_handle_id, target_handle_id, style_json, created_at, updated_at
)
SELECT
  id,
  '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002',
  src,
  tgt,
  kind,
  NULL,
  NULL,
  json_object('stroke', stroke, 'width', 2, 'dashed', json('false')),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM edges;

INSERT INTO canvas_app_state (canvas_id, viewport_json, app_state_json, updated_at)
VALUES (
  '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002',
  '{"x":-180,"y":-120,"zoom":0.36}',
  '{"lens":"canvas","seed":"root-archetypal-field"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(canvas_id) DO UPDATE SET
  viewport_json = excluded.viewport_json,
  app_state_json = excluded.app_state_json,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');

INSERT OR REPLACE INTO canvas_nodes (
  id, canvas_id, type, title, summary, position_x, position_y, width, height,
  content, tags, resource_kind, absolute_path, relative_path, mime_type,
  file_fingerprint, url, color, child_node_ids, target_canvas_id,
  created_at, updated_at, dot_colour, bg_colour, text_colour, thumbnail,
  sequence_caption, sequence_viewport_json
)
SELECT
  graph_node_id,
  canvas_id,
  'note',
  json_extract(style_json, '$.__canvasNode.title'),
  json_extract(style_json, '$.__canvasNode.content'),
  position_x,
  position_y,
  width,
  height,
  json_extract(style_json, '$.__canvasNode.content'),
  json_extract(style_json, '$.__canvasNode.tags'),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  '[]',
  NULL,
  created_at,
  updated_at,
  json_extract(style_json, '$.dotColour'),
  json_extract(style_json, '$.bgColour'),
  json_extract(style_json, '$.textColour'),
  NULL,
  NULL,
  NULL
FROM node_layout
WHERE canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002';

INSERT OR REPLACE INTO canvas_edges (
  id, canvas_id, source_node_id, target_node_id, relation_kind, directionality,
  label, note, style_json, created_at, updated_at, source_handle_id,
  target_handle_id, sequencing, sequence_priority
)
SELECT
  id,
  canvas_id,
  source_graph_node_id,
  target_graph_node_id,
  relation_kind,
  'forward',
  relation_kind,
  '',
  style_json,
  created_at,
  updated_at,
  source_handle_id,
  target_handle_id,
  0,
  0
FROM edge_layout
WHERE canvas_id = '8f4f5a90-4e36-4e7d-8b1a-2fb18f9fb002';

COMMIT;
PRAGMA foreign_keys = ON;
