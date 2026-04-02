"""
Migration: drop old operator_id FK constraint (was res_users, now repair_machine_operator)
"""
import logging
_logger = logging.getLogger(__name__)


def migrate(cr, version):
    """Drop the old FK constraint so Odoo can recreate it."""
    cr.execute("""
        ALTER TABLE repair_os_process
        DROP CONSTRAINT IF EXISTS repair_os_process_operator_id_fkey;
    """)
    # Also clear any orphan values pointing to res.users IDs
    # (IDs that don't exist in repair_machine_operator)
    cr.execute("""
        UPDATE repair_os_process
        SET operator_id = NULL
        WHERE operator_id IS NOT NULL
          AND operator_id NOT IN (
              SELECT id FROM repair_machine_operator
          );
    """)
    _logger.info("Migration: operator_id FK constraint dropped and orphans cleared")
