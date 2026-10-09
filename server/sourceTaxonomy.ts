/** Source-reviewed lookup terms, not generated prose. Every emitted record still requires a literal source span.
 * Subtypes keep tribes, human branches and offices distinct from biological species. */
export interface Taxon {name:string;type:string;aliases?:string[];classification:string;sourceIds?:string[];caseSensitive?:boolean}
const group=(type:string,classification:string,names:string[]):Taxon[]=>names.map(name=>({name,type,classification}));
export const SOURCE_TAXONOMY:Taxon[]=[
 ...group('planets','Documented world',['Eyeke','Kavian','Magor','Naron','Neri','Veles','Alta','Khaur','Velgemmis','Lopat','Earth','Alfrheim','New Pleione','Nyssari','Etra-Prime']),
 {name:'Planet B.',type:'planets',aliases:['PP-B'],classification:'Proposed surveyed world'},
 ...group('species','Federation species',['Altan','Elgem','Human','Khaured','Lopati','Onoros']),
 {name:'Robotron',type:'species',aliases:['Robotrons'],classification:'Artificial people; Federation recognition unresolved'},
 {name:'Designate Null',type:'planets',aliases:['planet designated Null'],classification:'Concealed Robotron birthworld in The Scattered Constellation',sourceIds:['github_pr_89'],caseSensitive:true},
 {name:'Elsewhere',type:'locations',classification:'Robotron subterranean city on Designate Null',sourceIds:['github_pr_89'],caseSensitive:true},
 {name:'The Collective',type:'factions',classification:'Robotron collective in The Scattered Constellation',sourceIds:['github_pr_89'],caseSensitive:true},
 {name:'The Architects',type:'species',classification:'Robotron creators; origins unresolved in this account',sourceIds:['github_pr_89'],caseSensitive:true},
 {name:'A-01',type:'characters',aliases:['The Fragmented'],classification:'Robotron archivist',sourceIds:['github_pr_89'],caseSensitive:true},
 ...group('species','Human branch',['Augments','Nordic']),
 ...group('species','Documented population',['Hodlodytes','Reptiloids']),
 {name:'The Federation',type:'factions',aliases:['Galactic Federation'],classification:'Interstellar federation'},
 {name:'Water Barons Guild',type:'factions',aliases:["Water Barons' Guild",'Water Barons’ Guild','Water Barons Guild of Naron'],classification:'Guild'},
 {name:'Sandmasters',type:'factions',aliases:['Sand masters'],classification:'Documented community'},
 ...group('factions','Guild or organization',["Necromancers' Guild",'Splicers','KavTech','Azurion Inc.','Red Lotus','Federation Congress','Federation Senate','Federation Frontier Survey Authority']),
 ...group('factions','Elgem tribe',['Veilwalkers','Mycelari','Luminari','Skywarders','Tidecallers']),

 ...group('characters','Named character',['R.3X','Joyce Astrid','Sigurd Stjerneskjold','Merimya','Colthrak','Erudus',"Hirruk G'Danz",'Alarik Solryn','Larkin Scheffler']),
 {name:'Hydrarch',type:'characters',classification:'Office or title; individual identity unresolved'},
 ...group('creatures','Documented animal population',['WAXbits']),
 ...group('locations','Ecumenopolis',['Zarithon Prime']),
 ...group('locations','Documented location',['Alta Prime','Lake Nyari','Suralith','Astra','Arcadia Prime','Thunder Peaks','Endless Veil','Crystal Caverns','Spore Valleys','Luminescent Swamplands','Vaults of Enlightenment']),
 ...group('locations','Proposed settlement or facility',['Eyeke Node Alpha','Neri Outpost Delta','Naron Central Node','Magor Relay Gamma','Kavian Frost Terminal','Veles Archon Station','Arkship Haven','Erekus']),
 ...group('technology','Material or technology',['Trilium','Triactor Technology','Triactor Jack','Data Core','Biometal','Arkhive','Galactic Fireblade','Sandmaster Spear','Waxon','Soul Sand','Fire Marble','M-Casters','R-Casters','Resonant Drill','Photonic Filaments','Bio-Mimetic Drones']),
 ...group('events','Named historical event or observance',['The Great Expansion','The Cataclysm','The Exodus','Festival of Resonance','Festival of the Sky’s Fury']),
 ...group('vehicles','Named vessel',['Alcazar'])
];
