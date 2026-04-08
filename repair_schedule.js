<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- Categoria do módulo -->
    <record id="module_category_repair_cilindros" model="ir.module.category">
        <field name="name">Reparo Cilindros</field>
        <field name="sequence">20</field>
    </record>

    <!-- Grupo Operador — acesso ao módulo -->
    <record id="group_repair_operator" model="res.groups">
        <field name="name">Operador</field>
        <field name="category_id" ref="module_category_repair_cilindros"/>
        <field name="implied_ids" eval="[(4, ref('base.group_user'))]"/>
        <field name="comment">Acesso às Ordens de Serviço, processos e dashboard.</field>
    </record>

    <!-- Grupo Supervisor — acesso total + configuração -->
    <record id="group_repair_supervisor" model="res.groups">
        <field name="name">Supervisor</field>
        <field name="category_id" ref="module_category_repair_cilindros"/>
        <field name="implied_ids" eval="[(4, ref('group_repair_operator'))]"/>
        <field name="comment">Acesso completo incluindo configurações, catálogo e relatórios.</field>
    </record>

</odoo>
