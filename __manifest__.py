{
    'name': 'Reparo Cilindros',
    'version': '16.0.1.0.0',
    'category': 'Manufacturing',
    'summary': 'Gestão de OS de Reparo e Fabricação de Cilindros Hidráulicos',
    'description': '''
Módulo completo para gestão de Ordens de Serviço de cilindros hidráulicos.

Funcionalidades:
- OS de Reparo e Fabricação (sem dependência MRP)
- Processos com cronômetro em tempo real (HH:MM:SS)
- Bloqueio de máquina em tempo real entre OS
- Sequência de processos por componente
- Controle de Qualidade com templates e checklist
- Catálogo de processos com carregamento em lote
- Relatório de Programação por Máquina
- Dashboard Kanban agrupado por estado
- Acompanhamento por OS / Máquina / Cliente
    ''',
    'author': 'pmorettobr',
    'website': '',
    'depends': ['repair', 'base', 'mail', 'web'],
    'external_dependencies': {},
    'data': [
        'security/res_groups.xml',
        'security/ir.model.access.csv',
        'data/hide_menus.xml',
        'views/repair_machine_views.xml',
        'views/repair_machine_operator_views.xml',
        'views/repair_component_views.xml',
        'views/repair_process_template_views.xml',
        'views/repair_process_views.xml',
        'views/repair_order_views.xml',
        'views/repair_dashboard_views.xml',
        'views/repair_report_wizard_views.xml',
        'views/menu.xml',
        'report/repair_os_report.xml',
        'report/repair_machine_report.xml',
        'wizard/repair_process_loader_views.xml',
    ],
    'images': ['static/description/icon.png'],
    'assets': {
        'web.assets_backend': [
            'cylinder_repair_os/static/src/css/repair.css',
            'cylinder_repair_os/static/src/js/timer.js',
            'cylinder_repair_os/static/src/xml/repair_schedule.xml',
            'cylinder_repair_os/static/src/js/repair_schedule.js',
            'cylinder_repair_os/static/src/xml/repair_dashboard.xml',
            'cylinder_repair_os/static/src/js/repair_dashboard.js',
        ],
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
