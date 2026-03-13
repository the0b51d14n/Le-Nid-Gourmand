-- ================================================
--  LE NID GOURMAND — Schéma Supabase v3
--  Fidélité : QR code, points, rangs, parrainage
--
--  LOGIQUE MÉTIER :
--  • Rangs    → basés sur les visites (0–50+)
--              réduction % sur l'addition totale (permanente)
--              + bonus one-shot au passage de niveau
--  • Points   → 2€ dépensés = 1 point
--              catalogue de récompenses à échanger
--              retour client ~8%, toujours bénéficiaire
-- ================================================


-- ── EXTENSION UUID ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ════════════════════════════════════════════════
--  TABLE : clients
-- ════════════════════════════════════════════════

CREATE TABLE clients (

    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité
    prenom              TEXT NOT NULL,
    nom                 TEXT NOT NULL,
    email               TEXT UNIQUE NOT NULL,
    telephone           TEXT,

    -- Date de naissance (offre anniversaire Phénix)
    date_naissance      DATE,

    -- QR code unique généré à l'inscription
    qr_code             TEXT UNIQUE NOT NULL DEFAULT uuid_generate_v4()::TEXT,

    -- ── SYSTÈME POINTS (2€ = 1 pt) ──────────────
    points              INTEGER NOT NULL DEFAULT 0,

    -- ── SYSTÈME RANGS (basé sur visites) ─────────
    visites_scannees    INTEGER NOT NULL DEFAULT 0,

    -- 'oeuf' | 'poussin' | 'oiseau' | 'rapace' | 'phenix'
    niveau              TEXT NOT NULL DEFAULT 'oeuf',

    -- ── PARRAINAGE ───────────────────────────────
    code_parrainage     TEXT UNIQUE NOT NULL DEFAULT UPPER(SUBSTRING(uuid_generate_v4()::TEXT, 1, 8)),
    parrain_id          UUID REFERENCES clients(id) ON DELETE SET NULL,
    parrainage_valide   BOOLEAN NOT NULL DEFAULT FALSE,

    -- ── OFFRE ANNIVERSAIRE (Phénix uniquement) ───
    offre_anniversaire_utilisee  BOOLEAN NOT NULL DEFAULT FALSE,
    annee_derniere_offre         INTEGER,

    -- ── METADATA ─────────────────────────────────
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


-- ════════════════════════════════════════════════
--  TABLE : visites
--  Chaque scan de QR code = une visite.
-- ════════════════════════════════════════════════

CREATE TABLE visites (

    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Montant total de l'addition AVANT réduction de rang
    montant_brut    NUMERIC(8, 2) NOT NULL DEFAULT 0,

    -- Réduction appliquée (% du rang au moment de la visite)
    reduction_pct   NUMERIC(4, 2) NOT NULL DEFAULT 0,

    -- Montant final après réduction
    montant_net     NUMERIC(8, 2) NOT NULL DEFAULT 0,

    -- Points crédités = FLOOR(montant_net / 2), calculé par le trigger
    points_gagnes   INTEGER NOT NULL DEFAULT 0,

    -- Bonus parrainage appliqué lors de cette visite
    bonus_parrainage BOOLEAN NOT NULL DEFAULT FALSE,

    -- Qui a scanné (email de l'admin)
    scanne_par      TEXT,

    -- Note libre
    note            TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


-- ════════════════════════════════════════════════
--  TABLE : recompenses
-- ════════════════════════════════════════════════

CREATE TABLE recompenses (

    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Origine
    -- 'passage_niveau' | 'echange_points' | 'anniversaire' | 'parrainage'
    origine         TEXT NOT NULL,

    -- Type
    -- 'cafe' | 'dessert' | 'entree' | 'plat' | 'repas_complet' | 'points_bonus'
    type            TEXT NOT NULL,

    description     TEXT NOT NULL,

    -- Points débités si échange (0 sinon)
    cout_points     INTEGER NOT NULL DEFAULT 0,

    utilisee        BOOLEAN NOT NULL DEFAULT FALSE,
    utilisee_le     TIMESTAMPTZ,

    -- NULL = pas d'expiration
    expire_le       TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


-- ════════════════════════════════════════════════
--  TABLE : niveaux
--
--  ÉQUILIBRE ÉCONOMIQUE DES RÉDUCTIONS :
--  Les boissons ont ~65% de marge, les plats ~70%.
--  Même à -12% (Phénix), le resto reste bénéficiaire
--  sur chaque addition. La réduction s'applique
--  sur le total (simple à encaisser en caisse).
-- ════════════════════════════════════════════════

CREATE TABLE niveaux (

    slug                TEXT PRIMARY KEY,
    label               TEXT NOT NULL,
    emoji               TEXT NOT NULL,
    description         TEXT NOT NULL,

    visites_min         INTEGER NOT NULL,
    visites_max         INTEGER,            -- NULL = dernier niveau

    -- Réduction permanente appliquée à chaque visite (%)
    reduction_pct       NUMERIC(4, 2) NOT NULL DEFAULT 0,

    -- Avantages textuels affichés dans l'espace client
    avantages           TEXT[] NOT NULL DEFAULT '{}',

    -- Bonus one-shot au passage de niveau
    bonus_passage       TEXT,               -- type de récompense (NULL pour 'oeuf')
    bonus_passage_desc  TEXT,
    bonus_expiration    INTERVAL NOT NULL DEFAULT '3 months'

);

INSERT INTO niveaux
    (slug, label, emoji, description, visites_min, visites_max,
     reduction_pct, avantages, bonus_passage, bonus_passage_desc, bonus_expiration)
VALUES

(
    'oeuf', 'Œuf', '🥚',
    'Tout juste éclos dans le nid',
    0, 4,
    0,
    ARRAY[
        'Accès au programme de fidélité',
        'Accumulation de points dès la première visite (2€ = 1 pt)'
    ],
    NULL, NULL, '3 months'
),

(
    'poussin', 'Poussin', '🐣',
    'Il découvre et revient',
    5, 14,
    5,
    ARRAY[
        '-5% sur l''addition à chaque visite',
        'Accumulation de points (2€ = 1 pt)'
    ],
    'dessert',
    'Bienvenue au rang Poussin 🐣 — un dessert offert lors de votre prochaine visite !',
    '3 months'
),

(
    'oiseau', 'Oiseau', '🐦',
    'Un habitué du nid',
    15, 29,
    8,
    ARRAY[
        '-8% sur l''addition à chaque visite',
        'Accumulation de points (2€ = 1 pt)'
    ],
    'entree',
    'Bienvenue au rang Oiseau 🐦 — une entrée offerte lors de votre prochaine visite !',
    '3 months'
),

(
    'rapace', 'Rapace', '🦅',
    'Un fidèle redoutable',
    30, 49,
    10,
    ARRAY[
        '-10% sur l''addition à chaque visite',
        'Réservation prioritaire (réponse garantie sous 2h)',
        'Accumulation de points (2€ = 1 pt)'
    ],
    'plat',
    'Bienvenue au rang Rapace 🦅 — un plat offert lors de votre prochaine visite !',
    '3 months'
),

(
    'phenix', 'Phénix', '🔥',
    'La légende du nid',
    50, NULL,
    12,
    ARRAY[
        '-12% sur l''addition à chaque visite',
        'Réservation prioritaire (réponse garantie sous 2h)',
        'Repas complet offert chaque année pour votre anniversaire',
        'Accumulation de points (2€ = 1 pt)'
    ],
    'repas_complet',
    'Bienvenue au rang Phénix 🔥 — un repas complet offert lors de votre prochaine visite !',
    '3 months'
);


-- ════════════════════════════════════════════════
--  TABLE : catalogue_points
--  2€ dépensés = 1 point — retour client ~8%
--
--  Exemple sur addition moyenne 25€ :
--  → 12 pts par visite
--  → Dessert (40 pts) en ~3,5 visites
--  → Repas complet (200 pts) en ~17 visites
-- ════════════════════════════════════════════════

CREATE TABLE catalogue_points (

    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            TEXT NOT NULL UNIQUE,
    label           TEXT NOT NULL,
    description     TEXT NOT NULL,
    cout_points     INTEGER NOT NULL,
    valeur_euros    NUMERIC(5, 2),
    actif           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

INSERT INTO catalogue_points (type, label, description, cout_points, valeur_euros) VALUES
    ('cafe',          'Café offert',         'Un café (expresso, allongé ou noisette) offert lors de votre prochaine visite.',               15,  1.50),
    ('dessert',       'Dessert offert',       'Un dessert au choix de la carte offert lors de votre prochaine visite.',                        40,  7.00),
    ('entree',        'Entrée offerte',       'Une entrée au choix de la carte offerte lors de votre prochaine visite.',                       60,  9.00),
    ('plat',          'Plat offert',          'Un plat au choix de la carte offert lors de votre prochaine visite.',                          100, 17.00),
    ('repas_complet', 'Repas complet offert', 'Une entrée + un plat + un dessert au choix offerts lors de votre prochaine visite.',           200, 35.00);


-- ════════════════════════════════════════════════
--  FONCTION : calcul du rang selon les visites
-- ════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculer_niveau(visites INTEGER)
RETURNS TEXT AS $$
BEGIN
    IF    visites >= 50 THEN RETURN 'phenix';
    ELSIF visites >= 30 THEN RETURN 'rapace';
    ELSIF visites >= 15 THEN RETURN 'oiseau';
    ELSIF visites >= 5  THEN RETURN 'poussin';
    ELSE                     RETURN 'oeuf';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ════════════════════════════════════════════════
--  TRIGGER : BEFORE INSERT sur visites
--
--  Ordre des opérations :
--  1. Lit la réduction du rang actuel du client
--  2. Calcule montant_net et points (FLOOR(net / 2))
--  3. Met à jour points + visites_scannees
--  4. Recalcule le rang → bonus one-shot si changement
--  5. Valide le parrainage à la 1ère visite du filleul
-- ════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_after_visite()
RETURNS TRIGGER AS $$
DECLARE
    red_pct         NUMERIC(4,2);
    pts_gagnes      INTEGER;
    ancien_niveau   TEXT;
    nouveau_niveau  TEXT;
    bonus_rec       RECORD;
BEGIN
    -- 1. Rang et réduction actuels du client
    SELECT niveau INTO ancien_niveau FROM clients WHERE id = NEW.client_id;
    SELECT reduction_pct INTO red_pct FROM niveaux WHERE slug = ancien_niveau;

    -- 2. Calculs montant_net et points
    NEW.reduction_pct := COALESCE(red_pct, 0);
    NEW.montant_net   := ROUND(NEW.montant_brut * (1 - NEW.reduction_pct / 100), 2);
    NEW.points_gagnes := FLOOR(NEW.montant_net / 2)::INTEGER;

    -- 3. Mise à jour du client
    UPDATE clients
    SET
        points           = points + NEW.points_gagnes,
        visites_scannees = visites_scannees + 1,
        updated_at       = NOW()
    WHERE id = NEW.client_id;

    -- 4. Recalcul du rang
    SELECT calculer_niveau(visites_scannees) INTO nouveau_niveau
    FROM clients WHERE id = NEW.client_id;

    IF nouveau_niveau IS DISTINCT FROM ancien_niveau THEN

        UPDATE clients SET niveau = nouveau_niveau WHERE id = NEW.client_id;

        SELECT bonus_passage, bonus_passage_desc, bonus_expiration
        INTO bonus_rec
        FROM niveaux WHERE slug = nouveau_niveau;

        IF bonus_rec.bonus_passage IS NOT NULL THEN
            INSERT INTO recompenses
                (client_id, origine, type, description, cout_points, expire_le)
            VALUES (
                NEW.client_id,
                'passage_niveau',
                bonus_rec.bonus_passage,
                bonus_rec.bonus_passage_desc,
                0,
                NOW() + bonus_rec.bonus_expiration
            );
        END IF;

    END IF;

    -- 5. Parrainage : valide à la toute 1ère visite du filleul
    --    COUNT = 0 car le INSERT n'est pas encore commité (BEFORE trigger)
    IF EXISTS (
        SELECT 1 FROM clients
        WHERE id = NEW.client_id
          AND parrain_id IS NOT NULL
          AND parrainage_valide = FALSE
    ) AND (SELECT COUNT(*) FROM visites WHERE client_id = NEW.client_id) = 0
    THEN
        UPDATE clients SET parrainage_valide = TRUE WHERE id = NEW.client_id;

        UPDATE clients
        SET points = points + 50, updated_at = NOW()
        WHERE id = (SELECT parrain_id FROM clients WHERE id = NEW.client_id);

        INSERT INTO recompenses (client_id, origine, type, description, cout_points)
        SELECT parrain_id, 'parrainage', 'points_bonus',
               'Votre filleul a effectué sa première visite — +50 points offerts !', 0
        FROM clients WHERE id = NEW.client_id;

        NEW.bonus_parrainage := TRUE;
    END IF;

    RETURN NEW;

END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_visite_insert
BEFORE INSERT ON visites
FOR EACH ROW EXECUTE FUNCTION trigger_after_visite();


-- ════════════════════════════════════════════════
--  TRIGGER : updated_at automatique sur clients
-- ════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ════════════════════════════════════════════════
--  FONCTION : échanger des points
--  Retourne 'ok' | 'points_insuffisants' | 'catalogue_inconnu'
-- ════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION echanger_points(
    p_client_id  UUID,
    p_type       TEXT
)
RETURNS TEXT AS $$
DECLARE
    cat     RECORD;
    solde   INTEGER;
BEGIN
    SELECT * INTO cat FROM catalogue_points
    WHERE type = p_type AND actif = TRUE LIMIT 1;

    IF NOT FOUND THEN RETURN 'catalogue_inconnu'; END IF;

    SELECT points INTO solde FROM clients WHERE id = p_client_id;

    IF solde < cat.cout_points THEN RETURN 'points_insuffisants'; END IF;

    UPDATE clients
    SET points = points - cat.cout_points, updated_at = NOW()
    WHERE id = p_client_id;

    INSERT INTO recompenses
        (client_id, origine, type, description, cout_points, expire_le)
    VALUES (
        p_client_id,
        'echange_points',
        cat.type,
        cat.label || ' — échangé contre ' || cat.cout_points || ' points',
        cat.cout_points,
        NOW() + INTERVAL '6 months'
    );

    RETURN 'ok';
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════
--  FONCTION : offre anniversaire annuelle (Phénix)
--  Retourne 'ok' | 'rang_insuffisant' | 'deja_attribuee'
-- ════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION attribuer_offre_anniversaire(p_client_id UUID)
RETURNS TEXT AS $$
DECLARE c RECORD;
BEGIN
    SELECT * INTO c FROM clients WHERE id = p_client_id;

    IF c.niveau <> 'phenix' THEN RETURN 'rang_insuffisant'; END IF;

    IF c.annee_derniere_offre = EXTRACT(YEAR FROM NOW())::INTEGER THEN
        RETURN 'deja_attribuee';
    END IF;

    INSERT INTO recompenses
        (client_id, origine, type, description, cout_points, expire_le)
    VALUES (
        p_client_id, 'anniversaire', 'repas_complet',
        'Joyeux anniversaire ! Un repas complet offert par Le Nid Gourmand 🎂',
        0, NOW() + INTERVAL '2 months'
    );

    UPDATE clients
    SET annee_derniere_offre        = EXTRACT(YEAR FROM NOW())::INTEGER,
        offre_anniversaire_utilisee = FALSE,
        updated_at                  = NOW()
    WHERE id = p_client_id;

    RETURN 'ok';
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════

ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE visites          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recompenses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE niveaux          ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_own_data"        ON clients          FOR ALL    USING (auth.uid() = id);
CREATE POLICY "client_own_visites"     ON visites          FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "client_own_recompenses" ON recompenses      FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "niveaux_public_read"    ON niveaux          FOR SELECT USING (TRUE);
CREATE POLICY "catalogue_public_read"  ON catalogue_points FOR SELECT USING (TRUE);


-- ════════════════════════════════════════════════
--  INDEX
-- ════════════════════════════════════════════════

CREATE INDEX idx_clients_email      ON clients(email);
CREATE INDEX idx_clients_qr_code    ON clients(qr_code);
CREATE INDEX idx_clients_niveau     ON clients(niveau);
CREATE INDEX idx_clients_parrain    ON clients(parrain_id);
CREATE INDEX idx_visites_client     ON visites(client_id);
CREATE INDEX idx_visites_date       ON visites(created_at DESC);
CREATE INDEX idx_recompenses_client ON recompenses(client_id);
CREATE INDEX idx_recompenses_active ON recompenses(client_id, utilisee) WHERE utilisee = FALSE;
CREATE INDEX idx_catalogue_actif    ON catalogue_points(actif) WHERE actif = TRUE;