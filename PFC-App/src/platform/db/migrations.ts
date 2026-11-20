/**
 * Forward-only, append-only migrations. Never edit a shipped entry — add a new version.
 * Money is stored as INTEGER VND (no minor unit) to avoid float drift.
 */
export const MIGRATIONS: ReadonlyArray<{ version: number; statements: string[] }> = [
  {
    version: 1,
    statements: [
      // Platform identity (FR-CORE-001/002, FR-X-001): one member across hubs.
      `CREATE TABLE members (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        action TEXT NOT NULL,
        object_ref TEXT,
        result TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      // Personal Finance (FR-FIN-001..007). Every row is owned by exactly one member.
      `CREATE TABLE fin_categories (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income','expense')),
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX fin_categories_member ON fin_categories(member_id, type)`,
      `CREATE TABLE fin_transactions (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('income','expense')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        category_id TEXT NOT NULL REFERENCES fin_categories(id),
        note TEXT NOT NULL DEFAULT '',
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX fin_transactions_member_date ON fin_transactions(member_id, occurred_at)`,
      `CREATE TABLE fin_budgets (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES fin_categories(id),
        month TEXT NOT NULL,
        limit_amount INTEGER NOT NULL CHECK (limit_amount > 0),
        created_at TEXT NOT NULL,
        UNIQUE (member_id, category_id, month)
      )`,
      `CREATE TABLE fin_goals (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_amount INTEGER NOT NULL CHECK (target_amount > 0),
        current_amount INTEGER NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
        deadline TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE fin_challenges (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        challenge_type TEXT NOT NULL CHECK (challenge_type IN ('saving','spending_limit')),
        target_amount INTEGER NOT NULL CHECK (target_amount > 0),
        duration_days INTEGER NOT NULL CHECK (duration_days > 0),
        start_date TEXT NOT NULL,
        first_check_in TEXT,
        last_check_in TEXT,
        checked_days INTEGER NOT NULL DEFAULT 0,
        progress_amount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','success','failed')),
        created_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    statements: [
      // Platform roles (src/platform/roles.ts). Default: Thành viên.
      "ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'thanh_vien'",
      "ALTER TABLE members ADD COLUMN department TEXT",
      "ALTER TABLE members ADD COLUMN locked INTEGER NOT NULL DEFAULT 0",
    ],
  },
  {
    version: 3,
    statements: [
      // Education Hub (FR-EDU-001…008). status: draft|submitted|published|rejected|archived
      `CREATE TABLE edu_courses (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES members(id),
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        topic TEXT NOT NULL CHECK (topic IN ('finance','development')),
        level TEXT NOT NULL CHECK (level IN ('basic','intermediate','advanced')),
        status TEXT NOT NULL DEFAULT 'draft',
        reject_reason TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE edu_lessons (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES edu_courses(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('video','reading')),
        video_url TEXT,
        body TEXT NOT NULL DEFAULT '',
        duration_min INTEGER NOT NULL DEFAULT 5
      )`,
      "CREATE INDEX edu_lessons_course ON edu_lessons(course_id, position)",
      `CREATE TABLE edu_enrollments (
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL REFERENCES edu_courses(id) ON DELETE CASCADE,
        enrolled_at TEXT NOT NULL,
        completed_at TEXT,
        PRIMARY KEY (member_id, course_id)
      )`,
      `CREATE TABLE edu_lesson_progress (
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        lesson_id TEXT NOT NULL REFERENCES edu_lessons(id) ON DELETE CASCADE,
        completed_at TEXT NOT NULL,
        PRIMARY KEY (member_id, lesson_id)
      )`,
      `CREATE TABLE edu_quizzes (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES members(id),
        course_id TEXT REFERENCES edu_courses(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        topic TEXT NOT NULL CHECK (topic IN ('finance','development')),
        pass_pct INTEGER NOT NULL DEFAULT 70 CHECK (pass_pct BETWEEN 1 AND 100),
        status TEXT NOT NULL DEFAULT 'draft',
        reject_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE edu_questions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL REFERENCES edu_quizzes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        options_json TEXT NOT NULL,
        correct_index INTEGER NOT NULL,
        explanation TEXT NOT NULL DEFAULT '',
        difficulty TEXT NOT NULL DEFAULT 'basic'
      )`,
      `CREATE TABLE edu_attempts (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL REFERENCES edu_quizzes(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        answers_json TEXT NOT NULL,
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        passed INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE edu_resources (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES members(id),
        title TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('ebook','template','checklist','article')),
        topic TEXT NOT NULL CHECK (topic IN ('finance','development')),
        url TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        reject_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE edu_threads (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES members(id),
        topic TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL
      )`,
      `CREATE TABLE edu_replies (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES edu_threads(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES members(id),
        body TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE edu_thread_likes (
        thread_id TEXT NOT NULL REFERENCES edu_threads(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        PRIMARY KEY (thread_id, member_id)
      )`,
    ],
  },
  {
    version: 4,
    statements: [
      // Marketplace (FR-MKT-001…009). Money: INTEGER VND. Seller verification is risk-based (Q04).
      `CREATE TABLE mkt_sellers (
        member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        shop_name TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
        reject_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE mkt_listings (
        id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL REFERENCES members(id),
        kind TEXT NOT NULL CHECK (kind IN ('product','digital','service','course')),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price INTEGER NOT NULL CHECK (price >= 0),
        stock INTEGER CHECK (stock IS NULL OR stock >= 0),
        delivery TEXT NOT NULL CHECK (delivery IN ('ship','pickup','online')),
        status TEXT NOT NULL DEFAULT 'draft',
        reject_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX mkt_listings_status ON mkt_listings(status, kind)",
      `CREATE TABLE mkt_cart_items (
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        listing_id TEXT NOT NULL REFERENCES mkt_listings(id) ON DELETE CASCADE,
        qty INTEGER NOT NULL CHECK (qty > 0),
        added_at TEXT NOT NULL,
        PRIMARY KEY (member_id, listing_id)
      )`,
      `CREATE TABLE mkt_favorites (
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        listing_id TEXT NOT NULL REFERENCES mkt_listings(id) ON DELETE CASCADE,
        PRIMARY KEY (member_id, listing_id)
      )`,
      `CREATE TABLE mkt_orders (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        buyer_id TEXT NOT NULL REFERENCES members(id),
        seller_id TEXT NOT NULL REFERENCES members(id),
        status TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cod','bank_transfer','in_person')),
        payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
        total INTEGER NOT NULL CHECK (total >= 0),
        recipient_name TEXT NOT NULL,
        recipient_phone TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        cancel_reason TEXT,
        checkout_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      "CREATE INDEX mkt_orders_buyer ON mkt_orders(buyer_id, created_at)",
      "CREATE INDEX mkt_orders_seller ON mkt_orders(seller_id, created_at)",
      "CREATE UNIQUE INDEX mkt_orders_checkout ON mkt_orders(buyer_id, seller_id, checkout_key)",
      `CREATE TABLE mkt_order_items (
        order_id TEXT NOT NULL REFERENCES mkt_orders(id) ON DELETE CASCADE,
        listing_id TEXT NOT NULL REFERENCES mkt_listings(id),
        title TEXT NOT NULL,
        unit_price INTEGER NOT NULL,
        qty INTEGER NOT NULL CHECK (qty > 0),
        PRIMARY KEY (order_id, listing_id)
      )`,
      `CREATE TABLE mkt_order_events (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES mkt_orders(id) ON DELETE CASCADE,
        actor_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE mkt_reviews (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES mkt_orders(id),
        listing_id TEXT NOT NULL REFERENCES mkt_listings(id) ON DELETE CASCADE,
        buyer_id TEXT NOT NULL REFERENCES members(id),
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE (order_id, listing_id)
      )`,
    ],
  },
  {
    version: 5,
    statements: [
      // Project Marketplace (FR-PROJ-001…008, SRS §9 Project lifecycle, BR-006 controlled collaboration).
      `CREATE TABLE prj_projects (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES members(id),
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        skills TEXT NOT NULL DEFAULT '',
        recruiting INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        reject_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT
      )`,
      `CREATE INDEX prj_projects_status ON prj_projects (status, updated_at)`,
      `CREATE TABLE prj_members (
        project_id TEXT NOT NULL REFERENCES prj_projects(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES members(id),
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT '',
        invited_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, member_id)
      )`,
      `CREATE INDEX prj_members_member ON prj_members (member_id, status)`,
      `CREATE TABLE prj_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES prj_projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        assignee_id TEXT REFERENCES members(id),
        due_date TEXT,
        created_by TEXT NOT NULL REFERENCES members(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX prj_tasks_project ON prj_tasks (project_id, status)`,
      `CREATE TABLE prj_updates (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES prj_projects(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES members(id),
        kind TEXT NOT NULL DEFAULT 'update',
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX prj_updates_project ON prj_updates (project_id, created_at)`,
      `CREATE TABLE prj_links (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES prj_projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'team',
        created_by TEXT NOT NULL REFERENCES members(id),
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE prj_feedback (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES prj_projects(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES members(id),
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT NOT NULL DEFAULT '',
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (project_id, author_id)
      )`,
      `CREATE TABLE prj_views (
        project_id TEXT NOT NULL REFERENCES prj_projects(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (project_id, member_id, day)
      )`,
    ],
  },
];
