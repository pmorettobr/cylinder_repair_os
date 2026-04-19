"""
Post-install hook para ocultar menus nativos do Odoo
que só existem se os módulos opcionais estiverem instalados.
"""


def post_init_hook(cr, registry):
    """Restringe menus nativos ao grupo Administrador."""
    from odoo import api, SUPERUSER_ID

    env = api.Environment(cr, SUPERUSER_ID, {})
    admin_group = env.ref('base.group_system')
    admin_id = admin_group.id

    def _hide(xmlid):
        """Oculta menu pelo xmlid — silencia erro se não existir."""
        try:
            menu = env.ref(xmlid, raise_if_not_found=False)
            if menu:
                # (6, 0, [...]) substitui TODOS os grupos — sem isso o menu
                # continua visível para usuários que já tinham acesso
                menu.write({'groups_id': [(6, 0, [admin_id])]})
        except Exception:
            pass

    def _hide_if_installed(xmlid, module_name):
        """Só oculta se o módulo estiver instalado."""
        module = env['ir.module.module'].search([
            ('name', '=', module_name),
            ('state', '=', 'installed'),
        ], limit=1)
        if module:
            _hide(xmlid)

    # ── Menus sempre presentes ────────────────────────────────────────
    _hide('mail.menu_root_discuss')       # Mensagens
    _hide('board.menu_board_my_dash')     # Painéis
    _hide('base.menu_module_top')         # Aplicativos (apps store)

    # ── Menus condicionais (só se o módulo estiver instalado) ─────────
    _hide_if_installed('sale.sale_menu_root',                   'sale')
    _hide_if_installed('purchase.menu_purchase_root',           'purchase')
    _hide_if_installed('stock.menu_stock_root',                 'stock')
    _hide_if_installed('mrp.menu_mrp_root',                     'mrp')
    _hide_if_installed('account.menu_finance',                  'account')
    _hide_if_installed('project.menu_main_pm',                  'project')
    _hide_if_installed('crm.crm_menu_root',                     'crm')
    _hide_if_installed('hr.menu_hr_root',                       'hr')
    _hide_if_installed('calendar.mail_menu_calendar',           'calendar')
    _hide_if_installed('website.menu_website_configuration',    'website')
    _hide_if_installed('link_tracker.menu_link_tracker',        'link_tracker')
    _hide_if_installed('base_setup.menu_general_configuration', 'base_setup')
