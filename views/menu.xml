<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- Raiz -->
    <menuitem id="menu_repair_root"
              name="Reparo Cilindros"
              groups="cylinder_repair_os.group_repair_operator,cylinder_repair_os.group_repair_supervisor"
              sequence="50"
              web_icon="cylinder_repair_os,static/description/icon.png"/>

    <!-- Dashboard -->
    <menuitem id="menu_repair_dashboard"
              name="Dashboard"
              parent="menu_repair_root"
              action="action_repair_dashboard"
              sequence="1"/>

    <!-- Ordens de Serviço -->
    <menuitem id="menu_repair_orders"
              name="Ordens de Serviço"
              parent="menu_repair_root"
              sequence="10"/>

    <menuitem id="menu_repair_orders_all"
              name="Todas as Ordens"
              parent="menu_repair_orders"
              action="action_repair_orders_os"
              sequence="10"/>

    <menuitem id="menu_repair_orders_repair"
              name="Reparos"
              parent="menu_repair_orders"
              action="action_repair_orders_repair"
              sequence="20"/>

    <menuitem id="menu_repair_orders_fabrication"
              name="Fabricações"
              parent="menu_repair_orders"
              action="action_repair_orders_fabrication"
              sequence="30"/>

    <!-- Acompanhamento -->
    <menuitem id="menu_repair_tracking"
              name="Acompanhamento"
              parent="menu_repair_root"
              sequence="20"/>

    <menuitem id="menu_repair_tracking_all"
              name="Status Geral"
              parent="menu_repair_tracking"
              action="action_repair_tracking_all"
              sequence="10"/>

    <menuitem id="menu_repair_tracking_os"
              name="Por OS"
              parent="menu_repair_tracking"
              action="action_repair_tracking_by_os"
              sequence="20"/>

    <menuitem id="menu_repair_tracking_machine"
              name="Por Centro de Trabalho"
              parent="menu_repair_tracking"
              action="action_repair_tracking_by_machine"
              sequence="30"/>

    <menuitem id="menu_repair_tracking_partner"
              name="Por Cliente"
              parent="menu_repair_tracking"
              action="action_repair_tracking_by_partner"
              sequence="40"/>

    <!-- Relatórios -->
    <menuitem id="menu_repair_reports"
              name="Relatórios"
              parent="menu_repair_root"
              sequence="80"
              groups="cylinder_repair_os.group_repair_supervisor"/>

    <menuitem id="menu_repair_report_machine"
              name="Programação por Centro de Trabalho"
              parent="menu_repair_reports"
              action="action_repair_machine_report_wizard"
              sequence="10"/>

    <!-- Configuração -->
    <menuitem id="menu_repair_config"
              name="Configuração"
              parent="menu_repair_root"
              sequence="90"
              groups="cylinder_repair_os.group_repair_supervisor"/>

    <menuitem id="menu_repair_process_catalog"
              name="Catálogo de Processos"
              parent="menu_repair_config"
              action="action_repair_process_template"
              sequence="10"/>

    <menuitem id="menu_repair_quality_templates"
              name="Templates de Qualidade"
              parent="menu_repair_config"
              action="action_repair_quality_templates"
              sequence="20"/>

    <menuitem id="menu_repair_machines"
              name="Centros de Trabalho"
              parent="menu_repair_config"
              action="action_repair_machines"
              sequence="30"/>

    <menuitem id="menu_repair_component_types"
              name="Componentes"
              parent="menu_repair_config"
              action="action_repair_component_types"
              sequence="40"/>

</odoo>
