<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <record id="view_repair_machine_operator_list" model="ir.ui.view">
        <field name="name">repair.machine.operator.list</field>
        <field name="model">repair.machine.operator</field>
        <field name="arch" type="xml">
            <tree string="Operadores" create="1" edit="0">
                <field name="name" string="Nome"/>
                <field name="machine_id" string="Centro de Trabalho"/>
                <field name="notes" string="Observação"/>
                <field name="active" invisible="1"/>
            </tree>
        </field>
    </record>

    <record id="view_repair_machine_operator_form" model="ir.ui.view">
        <field name="name">repair.machine.operator.form</field>
        <field name="model">repair.machine.operator</field>
        <field name="arch" type="xml">
            <form string="Operador">
                <sheet>
                    <group>
                        <group>
                            <field name="name" string="Nome"/>
                            <field name="machine_id" string="Centro de Trabalho"/>
                        </group>
                        <group>
                            <field name="notes" string="Observação"/>
                            <field name="active"/>
                        </group>
                    </group>
                </sheet>
            </form>
        </field>
    </record>

</odoo>
