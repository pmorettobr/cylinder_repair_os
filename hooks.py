"""
Post-install hook para ocultar menus nativos do Odoo
que só existem se os módulos opcionais estiverem instalados.
"""


def post_init_hook(cr, registry):
    """Oculta menus de módulos instalados para group_repair_operator."""
    from odoo import api, SUPERUSER_ID

    env = api.Environment(cr, SUPERUSER_ID, {})

    # Menus a ocultar se o módulo estiver instalado
    # formato: (xmlid_do_menu, nome_do_modulo)
    menus_to_hide = [
        ('sale.sale_menu_root',                   'sale'),
        ('purchase.menu_purchase_root',           'purchase'),
        ('stock.menu_stock_root',                 'stock'),
        ('mrp.menu_mrp_root',                     'mrp'),
        ('account.menu_finance',                  'account'),
        ('project.menu_main_pm',                  'project'),
        ('crm.crm_menu_root',                     'crm'),
        ('hr.menu_hr_root',                       'hr'),
        ('calendar.mail_menu_calendar',           'calendar'),
        ('website.menu_website_configuration',    'website'),
        ('link_tracker.menu_link_tracker',        'link_tracker'),
        ('base_setup.menu_general_configuration', 'base_setup'),
    ]

    admin_group = env.ref('base.group_system')

    for menu_xmlid, module_name in menus_to_hide:
        # Só aplica se o módulo estiver instalado
        module = env['ir.module.module'].search([
            ('name', '=', module_name),
            ('state', '=', 'installed'),
        ], limit=1)
        if not module:
            continue
        try:
            menu = env.ref(menu_xmlid)
            if admin_group not in menu.groups_id:
                menu.write({'groups_id': [(4, admin_group.id)]})
        except Exception:
            pass
