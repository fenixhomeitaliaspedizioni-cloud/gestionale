/* ========================================
   FENIX HOME ITALIA - GESTIONALE SPEDIZIONI
   server.js - Backend Express.js v2.0
   Con SQLite per persistenza dati
   ======================================== */

const express = require('express');
const app = express();
const path = require('path');
const PDFDocument = require('pdfkit');

// Database SQLite
const { db, getImpostazione, setImpostazione, addNotifica, getMittente, getTariffa, calcolaCosto } = require('./database');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// API SPEDIZIONI
// ============================================

// Lista spedizioni
app.get('/api/spedizioni', (req, res) => {
    try {
        const filtro = req.query.filtro || 'attive';
        let sql = 'SELECT * FROM spedizioni';
        
        if (filtro === 'attive') {
            sql += " WHERE stato != 'Cancellata'";
        } else if (filtro === 'cancellate') {
            sql += " WHERE stato = 'Cancellata'";
        }
        
        sql += ' ORDER BY created_at DESC';
        
        const spedizioni = db.prepare(sql).all();
        
        // Formatta per frontend
        const data = spedizioni.map(s => ({
            id: s.id,
            data: s.data,
            corriere: s.corriere,
            stato: s.stato,
            mittente: {
                nome: s.mitt_nome,
                indirizzo: s.mitt_indirizzo,
                cap: s.mitt_cap,
                citta: s.mitt_citta,
                prov: s.mitt_prov,
                telefono: s.mitt_telefono,
                email: s.mitt_email
            },
            destinatario: {
                nome: s.dest_nome,
                indirizzo: s.dest_indirizzo,
                cap: s.dest_cap,
                citta: s.dest_citta,
                prov: s.dest_prov,
                telefono: s.dest_telefono,
                email: s.dest_email
            },
            dettagli: {
                colli: s.colli,
                peso: s.peso,
                volume: s.volume,
                contrassegno: s.contrassegno,
                assicurazione: !!s.assicurazione,
                note: s.note
            },
            tracking: s.tracking,
            statoIncasso: s.stato_incasso,
            dataIncasso: s.data_incasso,
            costo: s.costo,
            distintaId: s.distinta_id,
            shopifyOrderId: s.shopify_order_id,
            shopifyOrderNumber: s.shopify_order_number,
            shopifyOrderName: s.shopify_order_name
        }));
        
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Dettaglio spedizione
app.get('/api/spedizione/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const s = db.prepare('SELECT * FROM spedizioni WHERE id = ?').get(id);
        
        if (!s) {
            return res.status(404).json({ success: false, message: 'Spedizione non trovata' });
        }
        
        const spedizione = {
            id: s.id,
            data: s.data,
            corriere: s.corriere,
            stato: s.stato,
            mittente: {
                nome: s.mitt_nome,
                indirizzo: s.mitt_indirizzo,
                cap: s.mitt_cap,
                citta: s.mitt_citta,
                prov: s.mitt_prov
            },
            destinatario: {
                nome: s.dest_nome,
                indirizzo: s.dest_indirizzo,
                cap: s.dest_cap,
                citta: s.dest_citta,
                prov: s.dest_prov,
                telefono: s.dest_telefono,
                email: s.dest_email
            },
            dettagli: {
                colli: s.colli,
                peso: s.peso,
                volume: s.volume,
                contrassegno: s.contrassegno,
                assicurazione: !!s.assicurazione,
                note: s.note
            },
            tracking: s.tracking,
            statoIncasso: s.stato_incasso,
            costo: s.costo,
            distintaId: s.distinta_id
        };
        
        res.json({ success: true, spedizione });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Crea spedizione
app.post('/api/crea-spedizione', (req, res) => {
    try {
        const dati = req.body;
        
        if (!dati.destinatario || !dati.destinatario.nome) {
            return res.status(400).json({ success: false, message: 'Dati incompleti' });
        }
        
        const dest = dati.destinatario;
        const dett = dati.dettagli || {};
        const mitt = dati.mittente || getMittente();
        
        const corriere = dett.corriere || '';
        const peso = parseFloat(dett.peso) || 1;
        const contrassegno = parseFloat(dett.contrassegno) || 0;
        const assicurazione = dett.assicurazione ? 1 : 0;
        
        const costo = calcolaCosto(corriere, peso, contrassegno, assicurazione);
        const oggi = new Date().toISOString().split('T')[0];
        
        const stmt = db.prepare(`
            INSERT INTO spedizioni (
                data, corriere, stato,
                mitt_nome, mitt_indirizzo, mitt_cap, mitt_citta, mitt_prov, mitt_telefono, mitt_email,
                dest_nome, dest_indirizzo, dest_cap, dest_citta, dest_prov, dest_telefono, dest_email,
                colli, peso, volume, contrassegno, assicurazione, note,
                stato_incasso, costo
            ) VALUES (?, ?, 'In Lavorazione', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            oggi, corriere,
            mitt.nome, mitt.indirizzo, mitt.cap, mitt.citta, mitt.prov, mitt.telefono, mitt.email,
            dest.nome, dest.indirizzo || '', dest.cap || '', dest.citta || '', dest.prov || '', dest.telefono || '', dest.email || '',
            parseInt(dett.colli) || 1, peso, parseFloat(dett.volume) || 0, contrassegno, assicurazione, dett.note || '',
            contrassegno > 0 ? 'In Attesa' : null, costo
        );
        
        addNotifica('spedizione', `Nuova spedizione #${result.lastInsertRowid} creata`, 'bi-box-seam', 'primary');
        
        res.json({
            success: true,
            id: result.lastInsertRowid,
            costo: costo,
            message: 'Spedizione creata con successo'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Modifica spedizione
app.put('/api/spedizione/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const dati = req.body;
        
        const exists = db.prepare('SELECT id FROM spedizioni WHERE id = ?').get(id);
        if (!exists) {
            return res.status(404).json({ success: false, message: 'Spedizione non trovata' });
        }
        
        const updates = [];
        const params = [];
        
        if (dati.stato) { updates.push('stato = ?'); params.push(dati.stato); }
        if (dati.corriere) { updates.push('corriere = ?'); params.push(dati.corriere); }
        if (dati.tracking) { updates.push('tracking = ?'); params.push(dati.tracking); }
        
        if (dati.destinatario) {
            if (dati.destinatario.nome) { updates.push('dest_nome = ?'); params.push(dati.destinatario.nome); }
            if (dati.destinatario.indirizzo) { updates.push('dest_indirizzo = ?'); params.push(dati.destinatario.indirizzo); }
            if (dati.destinatario.cap) { updates.push('dest_cap = ?'); params.push(dati.destinatario.cap); }
            if (dati.destinatario.citta) { updates.push('dest_citta = ?'); params.push(dati.destinatario.citta); }
            if (dati.destinatario.prov) { updates.push('dest_prov = ?'); params.push(dati.destinatario.prov); }
            if (dati.destinatario.telefono) { updates.push('dest_telefono = ?'); params.push(dati.destinatario.telefono); }
        }
        
        if (dati.dettagli) {
            if (dati.dettagli.colli) { updates.push('colli = ?'); params.push(dati.dettagli.colli); }
            if (dati.dettagli.peso) { updates.push('peso = ?'); params.push(dati.dettagli.peso); }
            if (dati.dettagli.contrassegno !== undefined) { updates.push('contrassegno = ?'); params.push(dati.dettagli.contrassegno); }
            if (dati.dettagli.note) { updates.push('note = ?'); params.push(dati.dettagli.note); }
        }
        
        if (updates.length > 0) {
            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(id);
            db.prepare(`UPDATE spedizioni SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
        
        res.json({ success: true, message: 'Spedizione aggiornata' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Elimina spedizione (soft delete)
app.delete('/api/spedizione/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = db.prepare("UPDATE spedizioni SET stato = 'Cancellata' WHERE id = ?").run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, message: 'Spedizione non trovata' });
        }
        
        res.json({ success: true, message: 'Spedizione spostata nel cestino' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Ripristina spedizione
app.post('/api/spedizione/:id/ripristina', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        db.prepare("UPDATE spedizioni SET stato = 'In Lavorazione' WHERE id = ? AND stato = 'Cancellata'").run(id);
        res.json({ success: true, message: 'Spedizione ripristinata' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Elimina multiple
app.post('/api/spedizioni/elimina-multiple', (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, message: 'IDs non validi' });
        }
        
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`UPDATE spedizioni SET stato = 'Cancellata' WHERE id IN (${placeholders})`).run(...ids);
        
        res.json({ success: true, count: ids.length, message: `${ids.length} spedizioni eliminate` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Svuota cestino
app.post('/api/svuota-cestino', (req, res) => {
    try {
        const result = db.prepare("DELETE FROM spedizioni WHERE stato = 'Cancellata'").run();
        res.json({ success: true, message: `Eliminati ${result.changes} elementi`, count: result.changes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API DASHBOARD
// ============================================

app.get('/api/dashboard', (req, res) => {
    try {
        const oggi = new Date().toISOString().split('T')[0];
        const inizioMese = oggi.substring(0, 7) + '-01';
        
        const spedizioniOggi = db.prepare("SELECT COUNT(*) as count FROM spedizioni WHERE date(created_at) = ? AND stato != 'Cancellata'").get(oggi)?.count || 0;
        const inTransito = db.prepare("SELECT COUNT(*) as count FROM spedizioni WHERE stato IN ('Spedito', 'In Transito', 'In Consegna')").get()?.count || 0;
        const consegnateMese = db.prepare("SELECT COUNT(*) as count FROM spedizioni WHERE stato = 'Consegnato' AND created_at >= ?").get(inizioMese)?.count || 0;
        const giacenze = db.prepare("SELECT COUNT(*) as count FROM spedizioni WHERE stato = 'Giacenza'").get()?.count || 0;
        const contrassegniDaIncassare = db.prepare("SELECT COALESCE(SUM(contrassegno), 0) as total FROM spedizioni WHERE contrassegno > 0 AND stato_incasso = 'In Attesa'").get()?.total || 0;
        const spedizioniMese = db.prepare("SELECT COUNT(*) as count FROM spedizioni WHERE created_at >= ? AND stato != 'Cancellata'").get(inizioMese)?.count || 0;
        
        res.json({
            success: true,
            kpi: {
                spedizioniOggi,
                inTransito,
                consegnateMese,
                giacenze,
                contrassegniDaIncassare,
                spedizioniSettimana: spedizioniOggi * 5,
                spedizioniMese,
                tempoMedio: 2.3
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API CONTRASSEGNI
// ============================================

app.get('/api/contrassegni', (req, res) => {
    try {
        const filtro = req.query.filtro || 'tutti';
        let sql = "SELECT * FROM spedizioni WHERE contrassegno > 0 AND stato != 'Cancellata'";
        
        if (filtro === 'attesa') {
            sql += " AND stato_incasso = 'In Attesa'";
        } else if (filtro === 'incassati') {
            sql += " AND stato_incasso = 'Incassato'";
        } else if (filtro === 'scaduti') {
            sql += " AND stato_incasso = 'In Attesa' AND stato = 'Giacenza'";
        }
        
        sql += ' ORDER BY created_at DESC';
        
        const contrassegni = db.prepare(sql).all();
        
        // Stats
        const daIncassare = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(contrassegno), 0) as total FROM spedizioni WHERE contrassegno > 0 AND stato_incasso = 'In Attesa' AND stato != 'Cancellata'").get();
        const incassati = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(contrassegno), 0) as total FROM spedizioni WHERE contrassegno > 0 AND stato_incasso = 'Incassato' AND stato != 'Cancellata'").get();
        const inTransito = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(contrassegno), 0) as total FROM spedizioni WHERE contrassegno > 0 AND stato_incasso = 'In Attesa' AND stato IN ('In Transito', 'In Consegna')").get();
        const scaduti = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(contrassegno), 0) as total FROM spedizioni WHERE contrassegno > 0 AND stato_incasso = 'In Attesa' AND stato = 'Giacenza'").get();
        
        const data = contrassegni.map(s => ({
            id: s.id,
            data: s.data,
            corriere: s.corriere,
            stato: s.stato,
            destinatario: { nome: s.dest_nome, citta: s.dest_citta },
            dettagli: { contrassegno: s.contrassegno },
            statoIncasso: s.stato_incasso,
            tracking: s.tracking
        }));
        
        res.json({
            success: true,
            data,
            stats: {
                daIncassare: { totale: daIncassare.total, count: daIncassare.count },
                inTransito: { totale: inTransito.total, count: inTransito.count },
                incassati: { totale: incassati.total, count: incassati.count },
                scaduti: { totale: scaduti.total, count: scaduti.count }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Incassa contrassegno
app.post('/api/contrassegno/:id/incassa', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { dataIncasso, note } = req.body;
        
        const spedizione = db.prepare('SELECT contrassegno FROM spedizioni WHERE id = ?').get(id);
        if (!spedizione) {
            return res.status(404).json({ success: false, message: 'Spedizione non trovata' });
        }
        
        db.prepare("UPDATE spedizioni SET stato_incasso = 'Incassato', data_incasso = ?, note_incasso = ? WHERE id = ?")
          .run(dataIncasso || new Date().toISOString().split('T')[0], note || '', id);
        
        addNotifica('contrassegno', `Incassato contrassegno #${id} - €${spedizione.contrassegno.toFixed(2)}`, 'bi-cash-coin', 'success');
        
        res.json({
            success: true,
            message: `Incasso di €${spedizione.contrassegno.toFixed(2)} confermato`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API DISTINTE
// ============================================

app.get('/api/distinte', (req, res) => {
    try {
        const distinte = db.prepare('SELECT * FROM distinte ORDER BY created_at DESC').all();
        res.json({ success: true, data: distinte });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/distinta/:id', (req, res) => {
    try {
        const id = req.params.id;
        const distinta = db.prepare('SELECT * FROM distinte WHERE id = ?').get(id);
        
        if (!distinta) {
            return res.status(404).json({ success: false, message: 'Distinta non trovata' });
        }
        
        const spedizioni = db.prepare('SELECT * FROM spedizioni WHERE distinta_id = ?').all(id);
        res.json({ success: true, distinta, spedizioni });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/distinte/spedizioni-disponibili/:corriere', (req, res) => {
    try {
        const corriere = req.params.corriere;
        const spedizioni = db.prepare("SELECT * FROM spedizioni WHERE corriere = ? AND stato = 'In Lavorazione' AND (distinta_id IS NULL OR distinta_id = '')").all(corriere);
        res.json({ success: true, data: spedizioni });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/distinta', (req, res) => {
    try {
        const { corriere, spedizioniIds, note, dataRitiro } = req.body;
        
        if (!corriere || !spedizioniIds || spedizioniIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Dati incompleti' });
        }
        
        // Genera ID distinta
        const count = db.prepare('SELECT COUNT(*) as count FROM distinte').get().count;
        const distintaId = `DST-${String(count + 1).padStart(5, '0')}`;
        
        // Calcola totali
        const placeholders = spedizioniIds.map(() => '?').join(',');
        const totali = db.prepare(`SELECT SUM(colli) as colli, SUM(peso) as peso FROM spedizioni WHERE id IN (${placeholders}) AND stato = 'In Lavorazione'`).get(...spedizioniIds);
        
        const oggi = new Date().toISOString().split('T')[0];
        
        // Crea distinta
        db.prepare('INSERT INTO distinte (id, data, data_ritiro, corriere, num_spedizioni, colli_totali, peso_totale, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(distintaId, oggi, dataRitiro || oggi, corriere, spedizioniIds.length, totali.colli || 0, totali.peso || 0, note || '');
        
        // Aggiorna spedizioni
        const timestamp = Date.now().toString().slice(-6);
        spedizioniIds.forEach((id, idx) => {
            const tracking = `${corriere.substring(0, 3).toUpperCase()}${timestamp}${id}`;
            db.prepare("UPDATE spedizioni SET stato = 'Spedito', distinta_id = ?, tracking = ? WHERE id = ?").run(distintaId, tracking, id);
        });
        
        addNotifica('distinta', `Distinta ${distintaId} creata con ${spedizioniIds.length} spedizioni`, 'bi-file-earmark-check', 'info');
        
        res.json({
            success: true,
            distinta: { id: distintaId, corriere, numSpedizioni: spedizioniIds.length },
            message: `Distinta ${distintaId} creata con successo`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/distinta/:id', (req, res) => {
    try {
        const id = req.params.id;
        const { stato } = req.body;
        
        if (stato) {
            db.prepare('UPDATE distinte SET stato = ? WHERE id = ?').run(stato, id);
            
            if (stato === 'Ritirata') {
                db.prepare("UPDATE spedizioni SET stato = 'In Transito' WHERE distinta_id = ?").run(id);
            }
        }
        
        res.json({ success: true, message: 'Distinta aggiornata' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API RUBRICA
// ============================================

app.get('/api/rubrica', (req, res) => {
    try {
        const search = req.query.search || '';
        const sort = req.query.sort || '';
        
        let sql = 'SELECT * FROM rubrica';
        const params = [];
        
        if (search) {
            sql += ' WHERE nome LIKE ? OR citta LIKE ? OR telefono LIKE ?';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        if (sort === 'frequenti') {
            sql += ' ORDER BY num_spedizioni DESC';
        } else if (sort === 'recenti') {
            sql += ' ORDER BY ultima_spedizione DESC';
        } else {
            sql += ' ORDER BY nome ASC';
        }
        
        const clienti = db.prepare(sql).all(...params);
        res.json({ success: true, data: clienti });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/rubrica/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const cliente = db.prepare('SELECT * FROM rubrica WHERE id = ?').get(id);
        
        if (!cliente) {
            return res.status(404).json({ success: false, message: 'Cliente non trovato' });
        }
        
        const spedizioni = db.prepare('SELECT * FROM spedizioni WHERE dest_nome = ? ORDER BY created_at DESC LIMIT 20').all(cliente.nome);
        res.json({ success: true, cliente, spedizioni });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/rubrica', (req, res) => {
    try {
        const dati = req.body;
        
        if (!dati.nome) {
            return res.status(400).json({ success: false, message: 'Nome richiesto' });
        }
        
        const result = db.prepare('INSERT INTO rubrica (nome, indirizzo, cap, citta, prov, telefono, email) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(dati.nome, dati.indirizzo || '', dati.cap || '', dati.citta || '', dati.prov || '', dati.telefono || '', dati.email || '');
        
        res.json({ success: true, id: result.lastInsertRowid, message: 'Cliente aggiunto' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/rubrica/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const dati = req.body;
        
        const updates = [];
        const params = [];
        
        ['nome', 'indirizzo', 'cap', 'citta', 'prov', 'telefono', 'email'].forEach(campo => {
            if (dati[campo] !== undefined) {
                updates.push(`${campo} = ?`);
                params.push(dati[campo]);
            }
        });
        
        if (updates.length > 0) {
            params.push(id);
            db.prepare(`UPDATE rubrica SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
        
        res.json({ success: true, message: 'Cliente aggiornato' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/rubrica/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        db.prepare('DELETE FROM rubrica WHERE id = ?').run(id);
        res.json({ success: true, message: 'Cliente eliminato' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API TRACKING
// ============================================

app.get('/api/tracking/:code', (req, res) => {
    try {
        const code = req.params.code;
        
        let spedizione = db.prepare('SELECT * FROM spedizioni WHERE tracking = ? COLLATE NOCASE').get(code);
        
        if (!spedizione && code.startsWith('#')) {
            const id = parseInt(code.substring(1));
            spedizione = db.prepare('SELECT * FROM spedizioni WHERE id = ?').get(id);
        }
        
        if (!spedizione) {
            spedizione = db.prepare('SELECT * FROM spedizioni WHERE id = ?').get(parseInt(code));
        }
        
        if (!spedizione) {
            return res.status(404).json({ success: false, message: 'Tracking non trovato' });
        }
        
        // Genera eventi tracking
        const eventi = generaEventiTracking(spedizione);
        
        res.json({
            success: true,
            spedizione: {
                id: spedizione.id,
                tracking: spedizione.tracking,
                stato: spedizione.stato,
                corriere: spedizione.corriere,
                destinatario: {
                    nome: spedizione.dest_nome,
                    citta: spedizione.dest_citta
                }
            },
            eventi
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

function generaEventiTracking(spedizione) {
    const eventi = [];
    const dataBase = new Date(spedizione.data || spedizione.created_at);
    
    eventi.push({ data: dataBase.toISOString(), descrizione: 'Spedizione creata', luogo: 'Milano', stato: 'Inserito' });
    
    if (['Spedito', 'In Transito', 'In Consegna', 'Consegnato'].includes(spedizione.stato)) {
        const d1 = new Date(dataBase);
        d1.setHours(d1.getHours() + 4);
        eventi.push({ data: d1.toISOString(), descrizione: 'Pacco ritirato dal corriere', luogo: 'Hub Milano', stato: 'Spedito' });
    }
    
    if (['In Transito', 'In Consegna', 'Consegnato'].includes(spedizione.stato)) {
        const d2 = new Date(dataBase);
        d2.setDate(d2.getDate() + 1);
        eventi.push({ data: d2.toISOString(), descrizione: 'In transito verso destinazione', luogo: 'Hub Centrale', stato: 'In Transito' });
    }
    
    if (['In Consegna', 'Consegnato'].includes(spedizione.stato)) {
        const d3 = new Date(dataBase);
        d3.setDate(d3.getDate() + 2);
        eventi.push({ data: d3.toISOString(), descrizione: 'In consegna oggi', luogo: spedizione.dest_citta, stato: 'In Consegna' });
    }
    
    if (spedizione.stato === 'Consegnato') {
        const d4 = new Date(dataBase);
        d4.setDate(d4.getDate() + 2);
        d4.setHours(14, 30, 0);
        eventi.push({ data: d4.toISOString(), descrizione: 'Consegnato', luogo: spedizione.dest_citta, stato: 'Consegnato' });
    }
    
    if (spedizione.stato === 'Giacenza') {
        const d5 = new Date(dataBase);
        d5.setDate(d5.getDate() + 2);
        eventi.push({ data: d5.toISOString(), descrizione: 'Tentativo di consegna fallito', luogo: spedizione.dest_citta, stato: 'Giacenza' });
    }
    
    return eventi.reverse();
}

// ============================================
// API NOTIFICHE
// ============================================

app.get('/api/notifiche', (req, res) => {
    try {
        const notifiche = db.prepare('SELECT * FROM notifiche ORDER BY created_at DESC LIMIT 50').all();
        res.json({ success: true, data: notifiche });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/notifiche/segna-lette', (req, res) => {
    try {
        db.prepare('UPDATE notifiche SET letta = 1').run();
        res.json({ success: true, message: 'Notifiche segnate come lette' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/notifica/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM notifiche WHERE id = ?').run(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API IMPOSTAZIONI
// ============================================

app.get('/api/impostazioni', (req, res) => {
    try {
        const rows = db.prepare('SELECT chiave, valore FROM impostazioni').all();
        const impostazioni = {
            mittente: getMittente(),
            tariffe: {}
        };
        
        const tariffe = db.prepare('SELECT * FROM tariffe').all();
        tariffe.forEach(t => {
            impostazioni.tariffe[t.corriere] = {
                base: t.tariffa_base,
                pesoKg: t.costo_kg,
                contrassegno: t.costo_contrassegno,
                assicurazione: t.costo_assicurazione,
                express: t.costo_express
            };
        });
        
        res.json({ success: true, impostazioni });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/impostazioni/mittente', (req, res) => {
    try {
        const dati = req.body;
        
        if (dati.nome) setImpostazione('mittente_nome', dati.nome);
        if (dati.indirizzo) setImpostazione('mittente_indirizzo', dati.indirizzo);
        if (dati.cap) setImpostazione('mittente_cap', dati.cap);
        if (dati.citta) setImpostazione('mittente_citta', dati.citta);
        if (dati.prov) setImpostazione('mittente_prov', dati.prov);
        if (dati.telefono !== undefined) setImpostazione('mittente_telefono', dati.telefono);
        if (dati.email) setImpostazione('mittente_email', dati.email);
        
        res.json({ success: true, mittente: getMittente() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API REPORT
// ============================================

app.get('/api/report', (req, res) => {
    try {
        const periodo = req.query.periodo || 'mese';
        const oggi = new Date().toISOString().split('T')[0];
        
        let dataInizio;
        if (periodo === 'settimana') {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            dataInizio = d.toISOString().split('T')[0];
        } else if (periodo === 'anno') {
            dataInizio = oggi.substring(0, 4) + '-01-01';
        } else {
            dataInizio = oggi.substring(0, 7) + '-01';
        }
        
        const totali = db.prepare(`
            SELECT 
                COUNT(*) as totale,
                SUM(CASE WHEN stato = 'Consegnato' THEN 1 ELSE 0 END) as consegnate,
                SUM(CASE WHEN stato = 'Giacenza' THEN 1 ELSE 0 END) as giacenze,
                COALESCE(SUM(costo), 0) as costo_totale
            FROM spedizioni 
            WHERE created_at >= ? AND stato != 'Cancellata'
        `).get(dataInizio);
        
        const perCorriere = {};
        db.prepare("SELECT corriere, COUNT(*) as count FROM spedizioni WHERE created_at >= ? AND stato != 'Cancellata' AND corriere != '' GROUP BY corriere")
          .all(dataInizio)
          .forEach(r => perCorriere[r.corriere] = r.count);
        
        const andamento = {};
        db.prepare("SELECT date(created_at) as data, COUNT(*) as count FROM spedizioni WHERE created_at >= ? AND stato != 'Cancellata' GROUP BY date(created_at)")
          .all(dataInizio)
          .forEach(r => andamento[r.data] = r.count);
        
        res.json({
            success: true,
            report: {
                totaleSpedizioni: totali.totale,
                consegnate: totali.consegnate,
                giacenze: totali.giacenze,
                successRate: totali.totale > 0 ? Math.round((totali.consegnate / totali.totale) * 100) : 0,
                costoTotale: totali.costo_totale,
                tempoMedio: 2.3,
                perCorriere,
                andamento
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API PREVENTIVATORE
// ============================================

app.post('/api/preventivo', (req, res) => {
    try {
        const { peso, colli, contrassegno, assicurazione, express } = req.body;
        
        if (!peso || peso <= 0) {
            return res.status(400).json({ success: false, message: 'Peso non valido' });
        }
        
        const tariffe = db.prepare('SELECT * FROM tariffe WHERE attivo = 1').all();
        const preventivi = [];
        
        tariffe.forEach(tariffa => {
            let costo = tariffa.tariffa_base + (peso * tariffa.costo_kg);
            if (contrassegno > 0) costo += tariffa.costo_contrassegno;
            if (assicurazione) costo += costo * (tariffa.costo_assicurazione / 100);
            if (express) costo += tariffa.costo_express;
            costo *= (colli || 1);
            
            preventivi.push({
                corriere: tariffa.corriere,
                costo: Math.round(costo * 100) / 100,
                tempoConsegna: express ? '24h' : (tariffa.corriere === 'DHL' || tariffa.corriere === 'UPS' ? '24-48h' : '48-72h')
            });
        });
        
        preventivi.sort((a, b) => a.costo - b.costo);
        res.json({ success: true, preventivi });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API UTENTI
// ============================================

app.get('/api/utenti', (req, res) => {
    try {
        const utenti = db.prepare('SELECT id, nome, email, ruolo, stato, ultimo_accesso, created_at FROM utenti').all();
        res.json({ success: true, data: utenti });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/utenti', (req, res) => {
    try {
        const { nome, email, password, ruolo, stato } = req.body;
        
        if (!nome || !email || !password) {
            return res.status(400).json({ success: false, message: 'Dati incompleti' });
        }
        
        const result = db.prepare('INSERT INTO utenti (nome, email, password, ruolo, stato) VALUES (?, ?, ?, ?, ?)')
          .run(nome, email, password, ruolo || 'operatore', stato || 'attivo');
        
        res.json({ success: true, id: result.lastInsertRowid, message: 'Utente creato' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ success: false, message: 'Email già registrata' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/utenti/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nome, email, password, ruolo, stato } = req.body;
        
        const updates = [];
        const params = [];
        
        if (nome) { updates.push('nome = ?'); params.push(nome); }
        if (email) { updates.push('email = ?'); params.push(email); }
        if (password) { updates.push('password = ?'); params.push(password); }
        if (ruolo) { updates.push('ruolo = ?'); params.push(ruolo); }
        if (stato) { updates.push('stato = ?'); params.push(stato); }
        
        if (updates.length > 0) {
            params.push(id);
            db.prepare(`UPDATE utenti SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
        
        res.json({ success: true, message: 'Utente aggiornato' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/utenti/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        // Non eliminare admin
        const utente = db.prepare('SELECT ruolo FROM utenti WHERE id = ?').get(id);
        if (utente && utente.ruolo === 'admin') {
            return res.status(400).json({ success: false, message: 'Impossibile eliminare admin' });
        }
        
        db.prepare('DELETE FROM utenti WHERE id = ?').run(id);
        res.json({ success: true, message: 'Utente eliminato' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API BACKUP
// ============================================

app.get('/api/backup', (req, res) => {
    try {
        const backup = {
            version: '2.0',
            app: 'Fenix Home Italia',
            exportDate: new Date().toISOString(),
            data: {
                spedizioni: db.prepare('SELECT * FROM spedizioni').all(),
                distinte: db.prepare('SELECT * FROM distinte').all(),
                rubrica: db.prepare('SELECT * FROM rubrica').all(),
                impostazioni: db.prepare('SELECT * FROM impostazioni').all(),
                tariffe: db.prepare('SELECT * FROM tariffe').all()
            }
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=fenix_backup_${new Date().toISOString().split('T')[0]}.json`);
        res.json(backup);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/restore', (req, res) => {
    try {
        const { data } = req.body;
        
        if (!data) {
            return res.status(400).json({ success: false, message: 'Dati backup non validi' });
        }
        
        // Ripristina (semplificato - in produzione aggiungere validazione)
        if (data.impostazioni) {
            data.impostazioni.forEach(row => {
                db.prepare('INSERT OR REPLACE INTO impostazioni (chiave, valore, tipo) VALUES (?, ?, ?)').run(row.chiave, row.valore, row.tipo);
            });
        }
        
        res.json({ success: true, message: 'Backup ripristinato' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// API SHOPIFY (placeholder)
// ============================================

app.get('/api/shopify/status', (req, res) => {
    res.json({
        success: true,
        enabled: getImpostazione('shopify_enabled', false),
        configured: !!getImpostazione('shopify_access_token'),
        shopDomain: getImpostazione('shopify_shop_domain', '')
    });
});

app.post('/api/shopify/test-connection', (req, res) => {
    const token = getImpostazione('shopify_access_token');
    if (!token) {
        return res.json({ success: false, message: 'Shopify non configurato' });
    }
    res.json({ success: true, message: 'Connessione OK (simulata)' });
});

app.post('/api/shopify/configure', (req, res) => {
    const { shopDomain, accessToken, enabled } = req.body;
    
    if (shopDomain) setImpostazione('shopify_shop_domain', shopDomain);
    if (accessToken) setImpostazione('shopify_access_token', accessToken);
    setImpostazione('shopify_enabled', enabled ? '1' : '0', 'boolean');
    
    res.json({ success: true, message: 'Configurazione Shopify salvata' });
});

// ============================================
// API PDF ETICHETTA
// ============================================

app.get('/api/etichetta/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const s = db.prepare('SELECT * FROM spedizioni WHERE id = ?').get(id);
        
        if (!s) {
            return res.status(404).send('Spedizione non trovata');
        }
        
        const doc = new PDFDocument({ size: 'A6', margin: 20 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=LDV-${id}.pdf`);
        
        doc.pipe(res);
        
        // Intestazione
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#d32f2f').text('FENIX HOME ITALIA', { align: 'center' });
        doc.fontSize(8).font('Helvetica').fillColor('#000000').text('Servizio Logistico', { align: 'center' });
        doc.moveDown(0.5);
        doc.lineWidth(2).moveTo(20, 60).lineTo(270, 60).stroke();
        
        // Tracking
        doc.moveDown(1);
        const trackingCode = s.tracking || `TRK-${id}-${Date.now().toString().slice(-4)}`;
        doc.rect(40, 70, 200, 30).fill('#000000');
        doc.fill('#FFFFFF').fontSize(10).text(trackingCode, 40, 78, { width: 200, align: 'center' });
        doc.fill('#000000');
        
        // Corriere
        doc.moveDown(2.5);
        doc.fontSize(12).font('Helvetica-Bold').text(`Corriere: ${s.corriere || 'N.D.'}`, { align: 'center' });
        
        // Destinatario
        doc.moveDown(1);
        doc.fontSize(9).font('Helvetica').text('DESTINATARIO:', { underline: true });
        doc.fontSize(14).font('Helvetica-Bold').text(s.dest_nome);
        doc.fontSize(11).font('Helvetica').text(s.dest_indirizzo || '');
        doc.text(`${s.dest_cap || ''} - ${s.dest_citta} (${s.dest_prov || ''})`);
        doc.fontSize(9).text(`Tel: ${s.dest_telefono || 'N/D'}`);
        
        // Mittente
        doc.moveDown(1);
        doc.fontSize(8).text('MITTENTE:', { underline: true });
        doc.text(s.mitt_nome || 'Fenix Home Italia');
        doc.text(`${s.mitt_indirizzo || ''}, ${s.mitt_cap || ''} ${s.mitt_citta || ''}`);
        
        // Dettagli
        doc.rect(20, 320, 250, 60).stroke();
        doc.fontSize(10).font('Helvetica-Bold').text(`Colli: ${s.colli}`, 30, 330);
        doc.text(`Peso: ${s.peso} kg`, 150, 330);
        doc.fontSize(9).font('Helvetica').text(`Data: ${s.data}`, 30, 350);
        
        if (s.contrassegno > 0) {
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#d32f2f').text(`CONTRASSEGNO: € ${s.contrassegno.toFixed(2)}`, 30, 365);
        }
        
        doc.fontSize(7).font('Helvetica').fillColor('#666666').text('Generato da Fenix Gestionale v2.0', 20, 395, { align: 'center' });
        
        doc.end();
    } catch (err) {
        res.status(500).send('Errore generazione PDF');
    }
});

// ============================================
// FALLBACK SPA
// ============================================

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// AVVIO SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const spedizioniCount = db.prepare('SELECT COUNT(*) as count FROM spedizioni').get().count;
    const clientiCount = db.prepare('SELECT COUNT(*) as count FROM rubrica').get().count;
    
    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   FENIX HOME ITALIA - GESTIONALE v2.0          ║');
    console.log('║   CON DATABASE SQLite PERSISTENTE              ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║  ✅ Server attivo: http://localhost:${PORT}         ║`);
    console.log(`║  📦 Spedizioni: ${String(spedizioniCount).padEnd(30)}║`);
    console.log(`║  👥 Clienti: ${String(clientiCount).padEnd(33)}║`);
    console.log(`║  💾 Database: SQLite (persistente)             ║`);
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
});
