/* ========================================
   FENIX HOME ITALIA - Database SQLite
   database.js - Persistenza dati
   ======================================== */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Percorso database - Railway usa /app/data per persistenza
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'fenix.db');

// Crea cartella data se non esiste
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Inizializza database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

console.log(`📦 Database SQLite: ${DB_PATH}`);

// ============================================
// CREAZIONE TABELLE
// ============================================

db.exec(`
    -- Tabella Spedizioni
    CREATE TABLE IF NOT EXISTS spedizioni (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT,
        corriere TEXT,
        stato TEXT DEFAULT 'In Lavorazione',
        
        mitt_nome TEXT,
        mitt_indirizzo TEXT,
        mitt_cap TEXT,
        mitt_citta TEXT,
        mitt_prov TEXT,
        mitt_telefono TEXT,
        mitt_email TEXT,
        
        dest_nome TEXT NOT NULL,
        dest_indirizzo TEXT,
        dest_cap TEXT,
        dest_citta TEXT,
        dest_prov TEXT,
        dest_telefono TEXT,
        dest_email TEXT,
        
        colli INTEGER DEFAULT 1,
        peso REAL DEFAULT 0,
        volume REAL DEFAULT 0,
        contrassegno REAL DEFAULT 0,
        assicurazione INTEGER DEFAULT 0,
        note TEXT,
        
        tracking TEXT,
        stato_incasso TEXT,
        data_incasso TEXT,
        note_incasso TEXT,
        costo REAL DEFAULT 0,
        distinta_id TEXT,
        
        shopify_order_id TEXT,
        shopify_order_number TEXT,
        shopify_order_name TEXT,
        shopify_fulfillment_id TEXT,
        shopify_fulfillment_status TEXT,
        shopify_customer_email TEXT,
        shopify_total_price REAL,
        shopify_line_items TEXT,
        
        ordini_unificati TEXT,
        prodotti_unificati TEXT,
        
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabella Distinte
    CREATE TABLE IF NOT EXISTS distinte (
        id TEXT PRIMARY KEY,
        data TEXT,
        data_ritiro TEXT,
        corriere TEXT NOT NULL,
        num_spedizioni INTEGER DEFAULT 0,
        colli_totali INTEGER DEFAULT 0,
        peso_totale REAL DEFAULT 0,
        stato TEXT DEFAULT 'In Attesa Ritiro',
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabella Rubrica
    CREATE TABLE IF NOT EXISTS rubrica (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        indirizzo TEXT,
        cap TEXT,
        citta TEXT,
        prov TEXT,
        telefono TEXT,
        email TEXT,
        num_spedizioni INTEGER DEFAULT 0,
        ultima_spedizione TEXT,
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabella Utenti
    CREATE TABLE IF NOT EXISTS utenti (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        ruolo TEXT DEFAULT 'operatore',
        stato TEXT DEFAULT 'attivo',
        ultimo_accesso TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabella Impostazioni
    CREATE TABLE IF NOT EXISTS impostazioni (
        chiave TEXT PRIMARY KEY,
        valore TEXT,
        tipo TEXT DEFAULT 'string'
    );

    -- Tabella Tariffe
    CREATE TABLE IF NOT EXISTS tariffe (
        corriere TEXT PRIMARY KEY,
        tariffa_base REAL DEFAULT 0,
        costo_kg REAL DEFAULT 0,
        costo_contrassegno REAL DEFAULT 0,
        costo_assicurazione REAL DEFAULT 0,
        costo_express REAL DEFAULT 0,
        attivo INTEGER DEFAULT 1
    );

    -- Tabella Notifiche
    CREATE TABLE IF NOT EXISTS notifiche (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        icona TEXT,
        colore TEXT,
        messaggio TEXT,
        letta INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabella Backup History
    CREATE TABLE IF NOT EXISTS backup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_file TEXT,
        dimensione TEXT,
        tipo TEXT DEFAULT 'manuale',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Indici
    CREATE INDEX IF NOT EXISTS idx_spedizioni_stato ON spedizioni(stato);
    CREATE INDEX IF NOT EXISTS idx_spedizioni_corriere ON spedizioni(corriere);
    CREATE INDEX IF NOT EXISTS idx_spedizioni_data ON spedizioni(data);
    CREATE INDEX IF NOT EXISTS idx_spedizioni_shopify ON spedizioni(shopify_order_id);
`);

// ============================================
// DATI INIZIALI
// ============================================

// Inserisci tariffe predefinite
const insertTariffa = db.prepare(`
    INSERT OR IGNORE INTO tariffe (corriere, tariffa_base, costo_kg, costo_contrassegno, costo_assicurazione, costo_express)
    VALUES (?, ?, ?, ?, ?, ?)
`);

const tariffePredefinite = [
    ['BRT', 5.50, 0.80, 2.50, 1.5, 5.00],
    ['GLS', 5.80, 0.75, 2.80, 1.8, 4.50],
    ['SDA', 5.20, 0.85, 2.30, 1.6, 5.50],
    ['DHL', 8.50, 1.20, 3.50, 2.0, 8.00],
    ['UPS', 9.00, 1.30, 3.80, 2.2, 9.00],
    ['Poste Italiane', 4.50, 0.60, 2.00, 1.2, 3.50]
];

tariffePredefinite.forEach(t => insertTariffa.run(...t));

// Inserisci impostazioni predefinite
const insertImpostazione = db.prepare(`
    INSERT OR IGNORE INTO impostazioni (chiave, valore, tipo) VALUES (?, ?, ?)
`);

const impostazioniPredefinite = [
    ['mittente_nome', 'Fenix Home Italia', 'string'],
    ['mittente_indirizzo', 'Via Esempio 1', 'string'],
    ['mittente_cap', '20100', 'string'],
    ['mittente_citta', 'Milano', 'string'],
    ['mittente_prov', 'MI', 'string'],
    ['mittente_telefono', '', 'string'],
    ['mittente_email', 'info@fenixhome.it', 'string'],
    ['shopify_enabled', '0', 'boolean'],
    ['shopify_shop_domain', '', 'string'],
    ['shopify_access_token', '', 'string']
];

impostazioniPredefinite.forEach(i => insertImpostazione.run(...i));

// Inserisci utente admin predefinito
const insertUtente = db.prepare(`
    INSERT OR IGNORE INTO utenti (nome, email, password, ruolo, stato)
    VALUES (?, ?, ?, ?, ?)
`);
// Password: admin123 (in produzione usare bcrypt)
insertUtente.run('Amministratore', 'admin@fenix.it', 'admin123', 'admin', 'attivo');

console.log('✅ Database inizializzato');

// ============================================
// FUNZIONI HELPER
// ============================================

function getImpostazione(chiave, defaultValue = null) {
    const row = db.prepare('SELECT valore, tipo FROM impostazioni WHERE chiave = ?').get(chiave);
    if (!row) return defaultValue;
    
    if (row.tipo === 'boolean') return row.valore === '1' || row.valore === 'true';
    if (row.tipo === 'number') return parseFloat(row.valore);
    return row.valore;
}

function setImpostazione(chiave, valore, tipo = 'string') {
    if (tipo === 'boolean') valore = valore ? '1' : '0';
    db.prepare('INSERT OR REPLACE INTO impostazioni (chiave, valore, tipo) VALUES (?, ?, ?)').run(chiave, String(valore), tipo);
}

function addNotifica(tipo, messaggio, icona = 'bi-bell', colore = 'info') {
    db.prepare('INSERT INTO notifiche (tipo, icona, colore, messaggio) VALUES (?, ?, ?, ?)').run(tipo, icona, colore, messaggio);
}

function getMittente() {
    return {
        nome: getImpostazione('mittente_nome', 'Fenix Home Italia'),
        indirizzo: getImpostazione('mittente_indirizzo', ''),
        cap: getImpostazione('mittente_cap', ''),
        citta: getImpostazione('mittente_citta', ''),
        prov: getImpostazione('mittente_prov', ''),
        telefono: getImpostazione('mittente_telefono', ''),
        email: getImpostazione('mittente_email', '')
    };
}

function getTariffa(corriere) {
    return db.prepare('SELECT * FROM tariffe WHERE corriere = ?').get(corriere);
}

function calcolaCosto(corriere, peso, contrassegno, assicurazione) {
    const tariffa = getTariffa(corriere);
    if (!tariffa) return 7.00;
    
    let costo = tariffa.tariffa_base + (peso * tariffa.costo_kg);
    if (contrassegno > 0) costo += tariffa.costo_contrassegno;
    if (assicurazione) costo += costo * (tariffa.costo_assicurazione / 100);
    
    return Math.round(costo * 100) / 100;
}

// ============================================
// EXPORT
// ============================================

module.exports = {
    db,
    getImpostazione,
    setImpostazione,
    addNotifica,
    getMittente,
    getTariffa,
    calcolaCosto
};
