-- ================================================
--  LE NID GOURMAND — Schéma Supabase
--  Fidélité : QR code, points, niveaux, parrainage
-- ================================================


-- ── EXTENSION UUID ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ════════════════════════════════════════════════
--  TABLE : clients
--  Un enregistrement par client inscrit.
-- ════════════════════════════════════════════════

CREATE TABLE clients (

    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identité
    prenom              TEXT NOT NULL,
    nom                 TEXT NOT NULL,
    email               TEXT UNIQUE NOT NULL,
    telephone           TEXT,

    -- Date de naissance (pour les offres anniversaire)
    date_naissance      DATE,

    -- QR code — chaîne unique générée à l'inscription
    qr_code             TEXT UNIQUE NOT NULL DEFAULT uuid_generate_v4()::TEXT,

    -- Points fidélité (1 pt par euro dépensé)
    points              INTEGER NOT NULL DEFAULT 0,

    -- Nombre de visites scannées (détermine le niveau)
    visites_scannees    INTEGER NOT NULL DEFAULT 0,

    -- Niveau calculé automatiquement via fonction
    -- 'oeuf' | 'poussin' | 'oiseau' | 'rapace' | 'phenix'
    niveau              TEXT NOT NULL DEFAULT 'oeuf',

    -- Parrainage
    code_parrainage     TEXT UNIQUE NOT NULL DEFAULT UPPER(SUBSTRING(uuid_generate_v4()::TEXT, 1, 8)),
    parrain_id          UUID REFERENCES clients(id) ON DELETE SET NULL,
    parrainage_valide   BOOLEAN NOT NULL DEFAULT FALSE,  -- devient TRUE après la 1ère visite filleul

    -- Offre anniversaire
    offre_anniversaire_utilisee  BOOLEAN NOT NULL DEFAULT FALSE,
    annee_derniere_offre         INTEGER,  -- évite de redonner l'offre 2x dans l'année

    -- Metadata
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

    -- Montant de la note (pour calculer les points)
    montant         NUMERIC(8, 2) NOT NULL DEFAULT 0,

    -- Points crédités lors de cette visite
    points_gagnes   INTEGER NOT NULL DEFAULT 0,

    -- Bonus parrainage appliqué lors de cette visite
    bonus_parrainage BOOLEAN NOT NULL DEFAULT FALSE,

    -- Qui a scanné (admin référencé par son email)
    scanne_par      TEXT,

    -- Notes libres (ex: "repas d'anniversaire")
    note            TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


-- ════════════════════════════════════════════════
--  TABLE : recompenses
--  Récompenses débloquées et leur statut.
-- ════════════════════════════════════════════════

CREATE TABLE recompenses (

    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Type de récompense
    -- 'cafe_offert' | 'dessert_offert' | 'entree_offerte' |
    -- 'priorite_resa' | 'anniversaire' | 'parrainage'
    type            TEXT NOT NULL,

    -- Description lisible
    description     TEXT NOT NULL,

    -- Coût en points (0 si offerte automatiquement par le niveau)
    cout_points     INTEGER NOT NULL DEFAULT 0,

    -- Statut
    utilisee        BOOLEAN NOT NULL DEFAULT FALSE,
    utilisee_le     TIMESTAMPTZ,

    -- Expiration (NULL = pas d'expiration)
    expire_le       TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


-- ════════════════════════════════════════════════
--  TABLE : niveaux
--  Référentiel des niveaux et leurs avantages.
--  Données statiques — à remplir une fois.
-- ════════════════════════════════════════════════

CREATE TABLE niveaux (

    slug            TEXT PRIMARY KEY,   -- 'oeuf' | 'poussin' | 'oiseau' | 'rapace' | 'phenix'
    label           TEXT NOT NULL,      -- 'Œuf' | 'Poussin' | ...
    emoji           TEXT NOT NULL,
    description     TEXT NOT NULL,
    visites_min     INTEGER NOT NULL,
    visites_max     INTEGER,            -- NULL = pas de plafond (dernier niveau)
    avantages       TEXT[] NOT NULL DEFAULT '{}'

);

-- Insertion des niveaux
INSERT INTO niveaux (slug, label, emoji, description, visites_min, visites_max, avantages) VALUES
    ('oeuf',    'Œuf',    '🥚', 'Tout juste éclos',         0,  4,    ARRAY['Bienvenue dans le nid !']),
    ('poussin', 'Poussin','🐣', 'Il découvre le nid',        5,  14,   ARRAY['Café offert à chaque palier de 5 visites']),
    ('oiseau',  'Oiseau', '🐦', 'Un habitué',                15, 29,   ARRAY['Dessert offert tous les 10 visites', 'Accès prioritaire aux événements']),
    ('rapace',  'Rapace', '🦅', 'Un fidèle redoutable',      30, 49,   ARRAY['Entrée offerte tous les 10 visites', 'Réservation prioritaire', 'Invitation événements privés']),
    ('phenix',  'Phénix', '🔥', 'La légende du nid',         50, NULL, ARRAY['Repas anniversaire offert', 'Table attitrée', 'Accès menu dégustation exclusif', 'Invitation soirées chef']);


-- ════════════════════════════════════════════════
--  FONCTION : calcul automatique du niveau
--  Appelée à chaque mise à jour des visites.
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
--  TRIGGER : mise à jour niveau + updated_at
--  Se déclenche après chaque INSERT dans visites.
-- ════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_after_visite()
RETURNS TRIGGER AS $$
DECLARE
    nouveau_niveau TEXT;
    ancien_niveau  TEXT;
BEGIN
    -- Récupère l'ancien niveau
    SELECT niveau INTO ancien_niveau FROM clients WHERE id = NEW.client_id;

    -- Met à jour visites_scannees, points et updated_at
    UPDATE clients
    SET
        visites_scannees = visites_scannees + 1,
        points           = points + NEW.points_gagnes,
        updated_at       = NOW()
    WHERE id = NEW.client_id;

    -- Recalcule le niveau
    SELECT calculer_niveau(visites_scannees) INTO nouveau_niveau
    FROM clients WHERE id = NEW.client_id;

    -- Met à jour le niveau si changement
    IF nouveau_niveau <> ancien_niveau THEN
        UPDATE clients SET niveau = nouveau_niveau WHERE id = NEW.client_id;

        -- Insère la récompense de passage de niveau
        INSERT INTO recompenses (client_id, type, description, cout_points)
        SELECT
            NEW.client_id,
            'passage_niveau',
            'Félicitations ! Vous êtes maintenant ' || n.label || ' ' || n.emoji,
            0
        FROM niveaux n WHERE n.slug = nouveau_niveau;
    END IF;

    -- Valide le parrainage à la 1ère visite du filleul
    UPDATE clients
    SET parrainage_valide = TRUE
    WHERE id = NEW.client_id
      AND parrain_id IS NOT NULL
      AND parrainage_valide = FALSE
      AND (SELECT COUNT(*) FROM visites WHERE client_id = NEW.client_id) = 1;

    -- Si parrainage validé → bonus 50 pts au parrain
    IF FOUND THEN
        UPDATE clients
        SET points     = points + 50,
            updated_at = NOW()
        WHERE id = (SELECT parrain_id FROM clients WHERE id = NEW.client_id);

        -- Notifie le parrain
        INSERT INTO recompenses (client_id, type, description, cout_points)
        SELECT
            parrain_id,
            'parrainage',
            'Votre filleul a effectué sa première visite ! +50 points offerts.',
            0
        FROM clients WHERE id = NEW.client_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_visite_insert
AFTER INSERT ON visites
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
--  ROW LEVEL SECURITY (RLS)
--  Chaque client ne voit que ses propres données.
-- ════════════════════════════════════════════════

ALTER TABLE clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recompenses ENABLE ROW LEVEL SECURITY;

-- Clients : lecture/modification de son propre profil uniquement
CREATE POLICY "client_own_data" ON clients
    FOR ALL USING (auth.uid() = id);

-- Visites : lecture de ses propres visites
CREATE POLICY "client_own_visites" ON visites
    FOR SELECT USING (auth.uid() = client_id);

-- Récompenses : lecture de ses propres récompenses
CREATE POLICY "client_own_recompenses" ON recompenses
    FOR SELECT USING (auth.uid() = client_id);

-- Niveaux : lecture publique (données statiques)
ALTER TABLE niveaux ENABLE ROW LEVEL SECURITY;
CREATE POLICY "niveaux_public_read" ON niveaux
    FOR SELECT USING (TRUE);


-- ════════════════════════════════════════════════
--  INDEX — optimisation des requêtes fréquentes
-- ════════════════════════════════════════════════

CREATE INDEX idx_clients_email      ON clients(email);
CREATE INDEX idx_clients_qr_code    ON clients(qr_code);
CREATE INDEX idx_clients_parrain    ON clients(parrain_id);
CREATE INDEX idx_visites_client     ON visites(client_id);
CREATE INDEX idx_visites_date       ON visites(created_at DESC);
CREATE INDEX idx_recompenses_client ON recompenses(client_id);
CREATE INDEX idx_recompenses_used   ON recompenses(utilisee) WHERE utilisee = FALSE;